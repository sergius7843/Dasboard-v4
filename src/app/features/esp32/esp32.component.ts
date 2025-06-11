import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../shared/components/header/header.component';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { MqttClientService } from '../../core/services/mqtt-client.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface LightZone {
  id: number;
  name: string;
  description: string;
  isOn: boolean;
  icon: string;
  lastUpdate?: Date;
}

@Component({
  selector: 'app-esp32',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    NavbarComponent,
    FooterComponent
  ],
  templateUrl: './esp32.component.html',
  styleUrl: './esp32.component.css'
})
export class Esp32Component implements OnInit, OnDestroy {

  // Configuración de zonas de iluminación del auditorio
  lightZones: LightZone[] = [
    { 
      id: 1, 
      name: 'Escenario Principal', 
      description: 'Iluminación principal del escenario',
      isOn: false,
      icon: 'stage'
    },
    { 
      id: 2, 
      name: 'Público - Sector A', 
      description: 'Iluminación del público lado izquierdo',
      isOn: false,
      icon: 'audience'
    },
    { 
      id: 3, 
      name: 'Público - Sector B', 
      description: 'Iluminación del público lado derecho',
      isOn: false,
      icon: 'audience'
    },
    { 
      id: 4, 
      name: 'Pasillo Central', 
      description: 'Iluminación del pasillo principal',
      isOn: false,
      icon: 'corridor'
    },
    { 
      id: 5, 
      name: 'Foyer/Entrada', 
      description: 'Iluminación del área de entrada',
      isOn: false,
      icon: 'entrance'
    },
    { 
      id: 6, 
      name: 'Emergencia', 
      description: 'Sistema de iluminación de emergencia',
      isOn: false,
      icon: 'emergency'
    }
  ];

  isConnected: boolean = false;
  allLightsOn: boolean = false;
  totalZones: number = 0;
  activeZones: number = 0;
  private subscription: Subscription = new Subscription();

  constructor(private mqttService: MqttClientService) {
    this.totalZones = this.lightZones.length;
  }

  ngOnInit(): void {
    this.subscribeToConnectionStatus();
    this.subscribeToLightStates();
    this.updateGlobalState();

    // Suscribirse a los topics de estado de focos
    if (this.mqttService.isConnected) {
      this.subscribeToLightTopics();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.mqttService.isConnected) {
      this.unsubscribeFromLightTopics();
    }
  }

  private subscribeToConnectionStatus(): void {
    const connectionSub = this.mqttService.connectionStatus$.subscribe(status => {
      this.isConnected = status.connected;

      if (status.connected) {
        this.subscribeToLightTopics();
      }
    });

    this.subscription.add(connectionSub);
  }

  private subscribeToLightStates(): void {
    const messagesSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg =>
          msg.topic.includes('esp32/auditorium/lights') && msg.topic.includes('/state')
        ))
      )
      .subscribe(messages => {
        messages
          .filter(msg => msg.topic.includes('esp32/auditorium/lights') && msg.topic.includes('/state'))
          .forEach(msg => this.processLightStateMessage(msg.topic, msg.payload));
      });

    this.subscription.add(messagesSub);
  }

  private subscribeToLightTopics(): void {
    this.lightZones.forEach(zone => {
      this.mqttService.subscribe(`esp32/auditorium/lights/${zone.id}/state`);
    });
  }

  private unsubscribeFromLightTopics(): void {
    this.lightZones.forEach(zone => {
      this.mqttService.unsubscribe(`esp32/auditorium/lights/${zone.id}/state`);
    });
  }

  private processLightStateMessage(topic: string, payload: string): void {
    try {
      const stateData = JSON.parse(payload);
      const zoneId = this.extractZoneIdFromTopic(topic);

      if (zoneId && stateData.status !== undefined) {
        const zone = this.lightZones.find(z => z.id === zoneId);
        if (zone) {
          zone.isOn = stateData.status === 'ON' || stateData.status === true;
          zone.lastUpdate = new Date();
          this.updateGlobalState();
        }
      }
    } catch (error) {
      console.error('Error parsing light state message:', error);
    }
  }

  private extractZoneIdFromTopic(topic: string): number | null {
    const match = topic.match(/esp32\/auditorium\/lights\/(\d+)\/state/);
    return match ? parseInt(match[1]) : null;
  }

  private updateGlobalState(): void {
    this.activeZones = this.lightZones.filter(zone => zone.isOn).length;
    this.allLightsOn = this.activeZones === this.totalZones;
  }

  // Métodos para controlar focos individuales
  toggleLight(zoneId: number): void {
    const zone = this.lightZones.find(z => z.id === zoneId);
    if (zone) {
      zone.isOn ? this.turnOffLight(zoneId) : this.turnOnLight(zoneId);
    }
  }

  turnOnLight(zoneId: number): void {
    if (!this.isConnected) {
      console.warn('MQTT no conectado');
      return;
    }

    const topic = `esp32/auditorium/lights/${zoneId}/set`;
    const payload = JSON.stringify({ command: 'ON' });

    this.mqttService.publish(topic, payload);

    // Actualizar estado local inmediatamente
    const zone = this.lightZones.find(z => z.id === zoneId);
    if (zone) {
      zone.isOn = true;
      zone.lastUpdate = new Date();
      this.updateGlobalState();
    }
  }

  turnOffLight(zoneId: number): void {
    if (!this.isConnected) {
      console.warn('MQTT no conectado');
      return;
    }

    const topic = `esp32/auditorium/lights/${zoneId}/set`;
    const payload = JSON.stringify({ command: 'OFF' });

    this.mqttService.publish(topic, payload);

    // Actualizar estado local inmediatamente
    const zone = this.lightZones.find(z => z.id === zoneId);
    if (zone) {
      zone.isOn = false;
      zone.lastUpdate = new Date();
      this.updateGlobalState();
    }
  }

  // Métodos para controles globales
  turnOnAllLights(): void {
    this.lightZones.forEach(zone => {
      this.turnOnLight(zone.id);
    });
  }

  turnOffAllLights(): void {
    this.lightZones.forEach(zone => {
      this.turnOffLight(zone.id);
    });
  }

  toggleAllLights(): void {
    this.allLightsOn ? this.turnOffAllLights() : this.turnOnAllLights();
  }

  // Métodos para escenarios predefinidos
  setScenario(scenario: string): void {
    switch (scenario) {
      case 'presentation':
        // Escenario: Solo escenario encendido
        this.turnOnLight(1);  // Escenario
        this.turnOffLight(2); // Público A
        this.turnOffLight(3); // Público B
        this.turnOnLight(4);  // Pasillo
        this.turnOnLight(5);  // Foyer
        break;
      
      case 'full':
        // Escenario: Todos encendidos
        this.turnOnAllLights();
        break;
      
      case 'break':
        // Escenario: Descanso - Solo áreas comunes
        this.turnOffLight(1); // Escenario
        this.turnOnLight(2);  // Público A
        this.turnOnLight(3);  // Público B
        this.turnOnLight(4);  // Pasillo
        this.turnOnLight(5);  // Foyer
        break;
      
      case 'emergency':
        // Escenario: Solo emergencia y pasillo
        this.turnOffLight(1); // Escenario
        this.turnOffLight(2); // Público A
        this.turnOffLight(3); // Público B
        this.turnOnLight(4);  // Pasillo
        this.turnOnLight(5);  // Foyer
        this.turnOnLight(6);  // Emergencia
        break;
    }
  }

  // Utilidades
  getZoneIcon(icon: string): string {
    const icons: { [key: string]: string } = {
      'stage': 'M7 4V2C7 1.45 7.45 1 8 1H16C16.55 1 17 1.45 17 2V4H20C20.55 4 21 4.45 21 5V19C21 19.55 20.55 20 20 20H4C3.45 20 3 19.55 3 19V5C3 4.45 3.45 4 4 4H7Z',
      'audience': 'M16 4C18.2 4 20 5.8 20 8C20 10.2 18.2 12 16 12C13.8 12 12 10.2 12 8C12 5.8 13.8 4 16 4ZM8 4C10.2 4 12 5.8 12 8C12 10.2 10.2 12 8 12C5.8 12 4 10.2 4 8C4 5.8 5.8 4 8 4ZM8 14C12.42 14 16 15.79 16 18V20H0V18C0 15.79 3.58 14 8 14Z',
      'corridor': 'M12 2L2 7L12 12L22 7L12 2ZM12 17.5L6.5 15L12 12.5L17.5 15L12 17.5Z',
      'entrance': 'M19 7H16V6A4 4 0 0 0 8 6V7H5A1 1 0 0 0 4 8V18A1 1 0 0 0 5 19H19A1 1 0 0 0 20 18V8A1 1 0 0 0 19 7ZM10 6A2 2 0 0 1 14 6V7H10V6Z',
      'emergency': 'M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z'
    };
    return icons[icon] || icons['stage'];
  }

  getStatusColor(isOn: boolean): string {
    return isOn ? 'text-success-500' : 'text-dark-400';
  }

  getStatusText(isOn: boolean): string {
    return isOn ? 'Encendido' : 'Apagado';
  }

  formatLastUpdate(date: Date | undefined): string {
    if (!date) return 'Sin datos';
    return date.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }
}