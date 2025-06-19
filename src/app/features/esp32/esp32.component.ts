// esp32.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../shared/components/header/header.component';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { TemperatureCardComponent } from '../dashboard/components/temperature-card/temperature-card.component';
import { LdrCardComponent } from '../dashboard/components/ldr-card/ldr-card.component';
import { MqttClientService } from '../../core/services/mqtt-client.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface LightZone {
  id: number;
  name: string;
  description: string;
  isOn: boolean;
  icon: string;
  location: 'stage' | 'hallway-right' | 'hallway-left';
  lastUpdate?: Date;
}

export interface FanControl {
  isOn: boolean;
  speed: number; // 0-100
  autoMode: boolean;
  lastUpdate?: Date;
}

export interface AutomationSettings {
  ldrAutoMode: boolean;
  temperatureAutoMode: boolean;
  temperatureThresholds: {
    hot: number;  // °C para encender ventilador
    cold: number; // °C para apagar ventilador
  };
  ldrThresholds: {
    dark: number;   // ADC para encender focos (cerca de 4095)
    bright: number; // ADC para apagar focos (cerca de 0)
  };
}

export interface TemperatureData {
  temperature_c: number;
  adc: number;
  timestamp: number;
}

export interface LdrData {
  ldr_raw: number;
  timestamp: number;
}

@Component({
  selector: 'app-esp32',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    NavbarComponent,
    FooterComponent,
    TemperatureCardComponent,
    LdrCardComponent
  ],
  templateUrl: './esp32.component.html',
  styleUrl: './esp32.component.css'
})
export class Esp32Component implements OnInit, OnDestroy {

  // Configuración de 4 focos
  lightZones: LightZone[] = [
    { 
      id: 1, 
      name: 'Escenario Principal', 
      description: 'Iluminación principal del escenario',
      isOn: false,
      icon: 'stage',
      location: 'stage'
    },
    { 
      id: 2, 
      name: 'Pasillo Derecho - A', 
      description: 'Foco 1 del pasillo derecho',
      isOn: false,
      icon: 'hallway',
      location: 'hallway-right'
    },
    { 
      id: 3, 
      name: 'Pasillo Derecho - B', 
      description: 'Foco 2 del pasillo derecho',
      isOn: false,
      icon: 'hallway',
      location: 'hallway-right'
    },
    { 
      id: 4, 
      name: 'Pasillo Izquierdo', 
      description: 'Foco del pasillo izquierdo',
      isOn: false,
      icon: 'hallway',
      location: 'hallway-left'
    }
  ];

  // Control del ventilador
  fanControl: FanControl = {
    isOn: false,
    speed: 0,
    autoMode: true,
    lastUpdate: undefined
  };

  // Configuración de automatización
  automationSettings: AutomationSettings = {
    ldrAutoMode: true, // Por defecto desactivado
    temperatureAutoMode: true, // Por defecto activado
    temperatureThresholds: {
      hot: 24.0,  // °C para encender ventilador
      cold: 16.0  // °C para apagar ventilador
    },
    ldrThresholds: {
      dark: 3000,   // ADC para encender focos (oscuro)
      bright: 1000  // ADC para apagar focos (luminoso)
    }
  };

  // Estados generales
  isConnected: boolean = false;
  allLightsOn: boolean = false;
  totalZones: number = 0;
  activeZones: number = 0;

  // Datos de sensores
  currentTemperature: number = 0;
  currentLdrValue: number = 0;
  
  private subscription: Subscription = new Subscription();

  constructor(private mqttService: MqttClientService) {
    this.totalZones = this.lightZones.length;
  }

  ngOnInit(): void {
    this.subscribeToConnectionStatus();
    this.subscribeToLightStates();
    this.subscribeToFanStates();
    this.subscribeToSensorData();
    this.updateGlobalState();

    // Suscribirse a los topics cuando esté conectado
    if (this.mqttService.isConnected) {
      this.subscribeToAllTopics();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.mqttService.isConnected) {
      this.unsubscribeFromAllTopics();
    }
  }

  private subscribeToConnectionStatus(): void {
    const connectionSub = this.mqttService.connectionStatus$.subscribe(status => {
      this.isConnected = status.connected;

      if (status.connected) {
        this.subscribeToAllTopics();
      }
    });

    this.subscription.add(connectionSub);
  }

  private subscribeToAllTopics(): void {
    // Topics de focos
    this.lightZones.forEach(zone => {
      this.mqttService.subscribe(`esp32/auditorium/lights/${zone.id}/state`);
    });

    // Topics del ventilador
    this.mqttService.subscribe('esp32/auditorium/fan/state');

    // Topics de sensores (ya están suscritos en sus componentes, pero los necesitamos aquí también)
    this.mqttService.subscribe('esp32/sensors/temperature');
    this.mqttService.subscribe('esp32/sensors/ldr');
  }

  private unsubscribeFromAllTopics(): void {
    this.lightZones.forEach(zone => {
      this.mqttService.unsubscribe(`esp32/auditorium/lights/${zone.id}/state`);
    });
    this.mqttService.unsubscribe('esp32/auditorium/fan/state');
    this.mqttService.unsubscribe('esp32/sensors/temperature');
    this.mqttService.unsubscribe('esp32/sensors/ldr');
  }

  // Suscripción a estados de focos
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

  // Suscripción a estados del ventilador
  private subscribeToFanStates(): void {
    const messagesSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg => msg.topic === 'esp32/auditorium/fan/state'))
      )
      .subscribe(messages => {
        const fanMessage = messages
          .filter(msg => msg.topic === 'esp32/auditorium/fan/state')
          .pop();

        if (fanMessage) {
          this.processFanStateMessage(fanMessage.payload);
        }
      });

    this.subscription.add(messagesSub);
  }

  // Suscripción a datos de sensores para automatización
  private subscribeToSensorData(): void {
    // Sensor de temperatura
    const tempSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg => msg.topic === 'esp32/sensors/temperature'))
      )
      .subscribe(messages => {
        const tempMessage = messages
          .filter(msg => msg.topic === 'esp32/sensors/temperature')
          .pop();

        if (tempMessage) {
          try {
            const tempData: TemperatureData = JSON.parse(tempMessage.payload);
            this.currentTemperature = tempData.temperature_c;
            this.processTemperatureAutomation(tempData.temperature_c);
          } catch (error) {
            console.error('Error parsing temperature data:', error);
          }
        }
      });

    // Sensor LDR
    const ldrSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg => msg.topic === 'esp32/sensors/ldr'))
      )
      .subscribe(messages => {
        const ldrMessage = messages
          .filter(msg => msg.topic === 'esp32/sensors/ldr')
          .pop();

        if (ldrMessage) {
          try {
            const ldrData: LdrData = JSON.parse(ldrMessage.payload);
            this.currentLdrValue = ldrData.ldr_raw;
            this.processLdrAutomation(ldrData.ldr_raw);
          } catch (error) {
            console.error('Error parsing LDR data:', error);
          }
        }
      });

    this.subscription.add(tempSub);
    this.subscription.add(ldrSub);
  }

  // Procesamiento de mensajes
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

  private processFanStateMessage(payload: string): void {
    try {
      const fanData = JSON.parse(payload);
      this.fanControl.isOn = fanData.status === 'ON' || fanData.status === true;
      this.fanControl.speed = fanData.speed || 0;
      this.fanControl.lastUpdate = new Date();
    } catch (error) {
      console.error('Error parsing fan state message:', error);
    }
  }

  private extractZoneIdFromTopic(topic: string): number | null {
    const match = topic.match(/esp32\/auditorium\/lights\/(\d+)\/state/);
    return match ? parseInt(match[1]) : null;
  }

  // Lógica de automatización
  private processTemperatureAutomation(temperature: number): void {
    if (!this.automationSettings.temperatureAutoMode) return;

    if (temperature >= this.automationSettings.temperatureThresholds.hot && !this.fanControl.isOn) {
      // Encender ventilador por temperatura alta
      this.publishFanControl(true, 'Temperatura alta detectada');
    } else if (temperature <= this.automationSettings.temperatureThresholds.cold && this.fanControl.isOn) {
      // Apagar ventilador por temperatura baja
      this.publishFanControl(false, 'Temperatura normal, apagando ventilador');
    }
  }

  private processLdrAutomation(ldrValue: number): void {
    if (!this.automationSettings.ldrAutoMode) return;

    if (ldrValue >= this.automationSettings.ldrThresholds.dark) {
      // Está oscuro - encender focos si no están encendidos
      const lightsOff = this.lightZones.filter(zone => !zone.isOn);
      if (lightsOff.length > 0) {
        console.log('LDR: Oscuro detectado, encendiendo focos automáticamente');
        this.turnOnAllLights();
      }
    } else if (ldrValue <= this.automationSettings.ldrThresholds.bright) {
      // Está luminoso - apagar focos si están encendidos
      const lightsOn = this.lightZones.filter(zone => zone.isOn);
      if (lightsOn.length > 0) {
        console.log('LDR: Luminosidad alta detectada, apagando focos automáticamente');
        this.turnOffAllLights();
      }
    }
  }

  // Control de focos
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

    // Actualizar estado local
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

    // Actualizar estado local
    const zone = this.lightZones.find(z => z.id === zoneId);
    if (zone) {
      zone.isOn = false;
      zone.lastUpdate = new Date();
      this.updateGlobalState();
    }
  }

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

  // Control del ventilador
  toggleFan(): void {
    this.publishFanControl(!this.fanControl.isOn, 'Control manual');
  }

  private publishFanControl(turnOn: boolean, reason: string): void {
    if (!this.isConnected) {
      console.warn('MQTT no conectado');
      return;
    }

    const topic = 'esp32/auditorium/fan/set';
    const payload = JSON.stringify({ 
      command: turnOn ? 'ON' : 'OFF',
      speed: turnOn ? 75 : 0, // Velocidad por defecto
      reason: reason
    });

    this.mqttService.publish(topic, payload);
    console.log(`Ventilador ${turnOn ? 'encendido' : 'apagado'}: ${reason}`);

    // Actualizar estado local
    this.fanControl.isOn = turnOn;
    this.fanControl.speed = turnOn ? 75 : 0;
    this.fanControl.lastUpdate = new Date();
  }

  // Control de automatización
  toggleLdrAutoMode(): void {
    this.automationSettings.ldrAutoMode = !this.automationSettings.ldrAutoMode;
    console.log(`Modo automático LDR: ${this.automationSettings.ldrAutoMode ? 'Activado' : 'Desactivado'}`);
  }

  toggleTemperatureAutoMode(): void {
    this.automationSettings.temperatureAutoMode = !this.automationSettings.temperatureAutoMode;
    console.log(`Modo automático temperatura: ${this.automationSettings.temperatureAutoMode ? 'Activado' : 'Desactivado'}`);
  }

  // Utilidades
  private updateGlobalState(): void {
    this.activeZones = this.lightZones.filter(zone => zone.isOn).length;
    this.allLightsOn = this.activeZones === this.totalZones;
  }

  getZoneIcon(icon: string): string {
    const icons: { [key: string]: string } = {
      'stage': 'M7 4V2C7 1.45 7.45 1 8 1H16C16.55 1 17 1.45 17 2V4H20C20.55 4 21 4.45 21 5V19C21 19.55 20.55 20 20 20H4C3.45 20 3 19.55 3 19V5C3 4.45 3.45 4 4 4H7Z',
      'hallway': 'M12 2L2 7L12 12L22 7L12 2ZM12 17.5L6.5 15L12 12.5L17.5 15L12 17.5Z'
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

  // Getters para el template
  get temperatureStatus(): string {
    if (this.currentTemperature >= this.automationSettings.temperatureThresholds.hot) {
      return 'Caliente';
    } else if (this.currentTemperature <= this.automationSettings.temperatureThresholds.cold) {
      return 'Frío';
    }
    return 'Normal';
  }

  get lightLevelStatus(): string {
    if (this.currentLdrValue >= this.automationSettings.ldrThresholds.dark) {
      return 'Oscuro';
    } else if (this.currentLdrValue <= this.automationSettings.ldrThresholds.bright) {
      return 'Luminoso';
    }
    return 'Intermedio';
  }
}