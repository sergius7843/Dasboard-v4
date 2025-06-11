import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../shared/components/header/header.component';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { MqttClientService } from '../../core/services/mqtt-client.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface LedGroup {
  id: number;
  name: string;
  color: RGBColor;
  isOn: boolean;
}

@Component({
  selector: 'app-control',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    NavbarComponent,
    FooterComponent
  ],
  templateUrl: './control.component.html',
  styleUrl: './control.component.css'
})
export class ControlComponent implements OnInit, OnDestroy {

  ledGroups: LedGroup[] = [
    { id: 1, name: 'LED Grupo 1', color: { r: 0, g: 0, b: 0 }, isOn: false },
    { id: 2, name: 'LED Grupo 2', color: { r: 0, g: 0, b: 0 }, isOn: false },
    { id: 3, name: 'LED Grupo 3', color: { r: 0, g: 0, b: 0 }, isOn: false }
  ];

  isConnected: boolean = false;
  private subscription: Subscription = new Subscription();

  // Colores predefinidos
  presetColors: RGBColor[] = [
    { r: 255, g: 0, b: 0 },     // Rojo
    { r: 0, g: 255, b: 0 },     // Verde
    { r: 0, g: 0, b: 255 },     // Azul
    { r: 255, g: 255, b: 0 },   // Amarillo
    { r: 255, g: 0, b: 255 },   // Magenta
    { r: 0, g: 255, b: 255 },   // Cyan
    { r: 255, g: 255, b: 255 }, // Blanco
    { r: 255, g: 165, b: 0 },   // Naranja
  ];

  constructor(private mqttService: MqttClientService) {}

  ngOnInit(): void {
    this.subscribeToConnectionStatus();
    this.subscribeToLedStates();

    // Suscribirse a los topics de estado de LEDs
    if (this.mqttService.isConnected) {
      this.subscribeToLedTopics();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.mqttService.isConnected) {
      this.unsubscribeFromLedTopics();
    }
  }

  private subscribeToConnectionStatus(): void {
    const connectionSub = this.mqttService.connectionStatus$.subscribe(status => {
      this.isConnected = status.connected;

      if (status.connected) {
        this.subscribeToLedTopics();
      }
    });

    this.subscription.add(connectionSub);
  }

  private subscribeToLedStates(): void {
    const messagesSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg =>
          msg.topic.includes('esp32/leds') && msg.topic.includes('/state')
        ))
      )
      .subscribe(messages => {
        messages
          .filter(msg => msg.topic.includes('esp32/leds') && msg.topic.includes('/state'))
          .forEach(msg => this.processLedStateMessage(msg.topic, msg.payload));
      });

    this.subscription.add(messagesSub);
  }

  private subscribeToLedTopics(): void {
    this.mqttService.subscribe('esp32/leds/1/state');
    this.mqttService.subscribe('esp32/leds/2/state');
    this.mqttService.subscribe('esp32/leds/3/state');
  }

  private unsubscribeFromLedTopics(): void {
    this.mqttService.unsubscribe('esp32/leds/1/state');
    this.mqttService.unsubscribe('esp32/leds/2/state');
    this.mqttService.unsubscribe('esp32/leds/3/state');
  }

  private processLedStateMessage(topic: string, payload: string): void {
    try {
      const stateData = JSON.parse(payload);
      const groupId = this.extractGroupIdFromTopic(topic);

      if (groupId && stateData.r !== undefined && stateData.g !== undefined && stateData.b !== undefined) {
        const group = this.ledGroups.find(g => g.id === groupId);
        if (group) {
          group.color = { r: stateData.r, g: stateData.g, b: stateData.b };
          group.isOn = stateData.r > 0 || stateData.g > 0 || stateData.b > 0;
        }
      }
    } catch (error) {
      console.error('Error parsing LED state message:', error);
    }
  }

  private extractGroupIdFromTopic(topic: string): number | null {
    const match = topic.match(/esp32\/leds\/(\d+)\/state/);
    return match ? parseInt(match[1]) : null;
  }

  // Métodos para controlar LEDs
  setLedColor(groupId: number, color: RGBColor): void {
    if (!this.isConnected) {
      console.warn('MQTT no conectado');
      return;
    }

    const topic = `esp32/leds/${groupId}/set`;
    const payload = JSON.stringify(color);

    this.mqttService.publish(topic, payload);

    // Actualizar estado local inmediatamente
    const group = this.ledGroups.find(g => g.id === groupId);
    if (group) {
      group.color = { ...color };
      group.isOn = color.r > 0 || color.g > 0 || color.b > 0;
    }
  }

  turnOffLed(groupId: number): void {
    this.setLedColor(groupId, { r: 0, g: 0, b: 0 });
  }

  turnOnLed(groupId: number, color?: RGBColor): void {
    const defaultColor = color || { r: 255, g: 255, b: 255 };
    this.setLedColor(groupId, defaultColor);
  }

  applyPresetColor(groupId: number, color: RGBColor): void {
    this.setLedColor(groupId, color);
  }

  turnOffAllLeds(): void {
    this.ledGroups.forEach(group => {
      this.turnOffLed(group.id);
    });
  }

  setAllLedsColor(color: RGBColor): void {
    this.ledGroups.forEach(group => {
      this.setLedColor(group.id, color);
    });
  }

  // Utilidades
  getColorStyle(color: RGBColor): string {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }

  getColorHex(color: RGBColor): string {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  }

  onColorChange(groupId: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const hex = input.value;
    const color = this.hexToRgb(hex);
    if (color) {
      this.setLedColor(groupId, color);
    }
  }

  onSliderChange(groupId: number, component: 'r' | 'g' | 'b', value: number): void {
    const group = this.ledGroups.find(g => g.id === groupId);
    if (group) {
      const newColor = { ...group.color };
      newColor[component] = value;
      this.setLedColor(groupId, newColor);
    }
  }

  private hexToRgb(hex: string): RGBColor | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
}
