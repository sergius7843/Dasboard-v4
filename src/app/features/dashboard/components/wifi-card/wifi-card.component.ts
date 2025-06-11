import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MqttClientService } from '../../../../core/services/mqtt-client.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface WiFiData {
  connected: boolean;
  ssid: string;
  ip: string;
  mac: string;
  rssi: number;
}

@Component({
  selector: 'app-wifi-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './wifi-card.component.html',
  styleUrl: './wifi-card.component.css'
})
export class WiFiCardComponent implements OnInit, OnDestroy {

  wifiData: WiFiData | null = null;
  isConnected: boolean = false;
  lastUpdate: Date | null = null;
  private subscription: Subscription = new Subscription();

  constructor(private mqttService: MqttClientService) {}

  ngOnInit(): void {
    this.subscribeToWiFiData();
    this.subscribeToConnectionStatus();

    // Suscribirse al topic de WiFi
    if (this.mqttService.isConnected) {
      this.mqttService.subscribe('esp32/wifi/status');
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.mqttService.isConnected) {
      this.mqttService.unsubscribe('esp32/wifi/status');
    }
  }

  private subscribeToWiFiData(): void {
    const messagesSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg => msg.topic === 'esp32/wifi/status'))
      )
      .subscribe(messages => {
        const wifiMessage = messages
          .filter(msg => msg.topic === 'esp32/wifi/status')
          .pop(); // Obtener el mensaje más reciente

        if (wifiMessage) {
          try {
            this.wifiData = JSON.parse(wifiMessage.payload);
            this.lastUpdate = wifiMessage.timestamp;
          } catch (error) {
            console.error('Error parsing WiFi data:', error);
          }
        }
      });

    this.subscription.add(messagesSub);
  }

  private subscribeToConnectionStatus(): void {
    const connectionSub = this.mqttService.connectionStatus$.subscribe(status => {
      this.isConnected = status.connected;

      // Auto-suscribirse cuando se conecte
      if (status.connected) {
        this.mqttService.subscribe('esp32/wifi/status');
      }
    });

    this.subscription.add(connectionSub);
  }

  // Obtener nivel de señal WiFi
  getSignalStrength(): 'excellent' | 'good' | 'fair' | 'poor' | 'no-signal' {
    if (!this.wifiData || !this.wifiData.connected) return 'no-signal';

    const rssi = this.wifiData.rssi;
    if (rssi >= -30) return 'excellent';
    if (rssi >= -50) return 'good';
    if (rssi >= -70) return 'fair';
    return 'poor';
  }

  // Obtener porcentaje de señal WiFi
  getSignalPercentage(): number {
    if (!this.wifiData || !this.wifiData.connected) return 0;

    const rssi = this.wifiData.rssi;
    // Convertir RSSI a porcentaje (rango típico: -100 a -30)
    const percentage = Math.min(100, Math.max(0, (rssi + 100) * (100 / 70)));
    return Math.round(percentage);
  }

  // Obtener color según la calidad de señal
  getSignalColor(): string {
    const strength = this.getSignalStrength();
    switch (strength) {
      case 'excellent': return 'success';
      case 'good': return 'success';
      case 'fair': return 'warning';
      case 'poor': return 'danger';
      default: return 'danger';
    }
  }

  // Obtener descripción de la señal
  getSignalDescription(): string {
    const strength = this.getSignalStrength();
    switch (strength) {
      case 'excellent': return 'Excelente';
      case 'good': return 'Buena';
      case 'fair': return 'Regular';
      case 'poor': return 'Débil';
      default: return 'Sin señal';
    }
  }

  // Formatear dirección MAC
  formatMacAddress(mac: string): string {
    if (!mac) return 'N/A';
    return mac.toUpperCase();
  }

  // Obtener clase CSS para el estado de conexión
  getConnectionStatusClass(): string {
    if (!this.wifiData) return 'disconnected';
    return this.wifiData.connected ? 'connected' : 'disconnected';
  }

  // Verificar si los datos están actualizados (menos de 15 segundos)
  isDataFresh(): boolean {
    if (!this.lastUpdate) return false;
    const now = new Date();
    const diffMs = now.getTime() - this.lastUpdate.getTime();
    return diffMs < 15000; // 15 segundos
  }

  // Obtener número de barras de señal para mostrar
  getSignalBars(): number {
    const percentage = this.getSignalPercentage();
    if (percentage >= 75) return 4;
    if (percentage >= 50) return 3;
    if (percentage >= 25) return 2;
    if (percentage > 0) return 1;
    return 0;
  }

  // Generar array para las barras de señal
  getSignalBarsArray(): number[] {
    return Array.from({length: 4}, (_, i) => i + 1);
  }

  // Verificar si una barra específica debe estar activa
  isBarActive(barNumber: number): boolean {
    return barNumber <= this.getSignalBars();
  }
}
