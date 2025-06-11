import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MqttClientService } from '../../../../core/services/mqtt-client.service';
import { Subscription, interval } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface HeartbeatData {
  online: boolean;
  timestamp: number;
  client_id: string;
}

export interface DeviceStatus {
  isOnline: boolean;
  lastSeen: Date | null;
  timeSinceLastBeat: number; // en ms
  consecutiveBeats: number;
  totalBeats: number;
  averageInterval: number; // promedio entre heartbeats
}

@Component({
  selector: 'app-heartbeat-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './heartbeat-card.component.html',
  styleUrl: './heartbeat-card.component.css'
})
export class HeartbeatCardComponent implements OnInit, OnDestroy {

  heartbeatData: HeartbeatData | null = null;
  deviceStatus: DeviceStatus = {
    isOnline: false,
    lastSeen: null,
    timeSinceLastBeat: 0,
    consecutiveBeats: 0,
    totalBeats: 0,
    averageInterval: 0
  };

  isConnected: boolean = false;
  private subscription: Subscription = new Subscription();
  private heartbeatHistory: number[] = []; // timestamps de heartbeats
  private statusCheckInterval: any;
  private lastHeartbeatTime: number = 0;

  // Configuración
  private readonly HEARTBEAT_TIMEOUT = 5000; // 5 segundos (ESP32 envía cada 2.5s)
  private readonly EXPECTED_INTERVAL = 2500; // 2500ms esperado

  constructor(private mqttService: MqttClientService) {}

  ngOnInit(): void {
    this.subscribeToHeartbeatData();
    this.subscribeToConnectionStatus();
    this.startStatusChecker();

    // Suscribirse al topic de heartbeat
    if (this.mqttService.isConnected) {
      this.mqttService.subscribe('esp32/status/heartbeat');
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    if (this.mqttService.isConnected) {
      this.mqttService.unsubscribe('esp32/status/heartbeat');
    }
  }

  private subscribeToHeartbeatData(): void {
    const messagesSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg => msg.topic === 'esp32/status/heartbeat'))
      )
      .subscribe(messages => {
        const heartbeatMessage = messages
          .filter(msg => msg.topic === 'esp32/status/heartbeat')
          .pop(); // Obtener el mensaje más reciente

        if (heartbeatMessage) {
          try {
            this.heartbeatData = JSON.parse(heartbeatMessage.payload);
            this.processHeartbeat(heartbeatMessage.timestamp);
          } catch (error) {
            console.error('Error parsing heartbeat data:', error);
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
        this.mqttService.subscribe('esp32/status/heartbeat');
      } else {
        // Si se desconecta MQTT, marcar dispositivo como offline
        this.deviceStatus.isOnline = false;
      }
    });

    this.subscription.add(connectionSub);
  }

  private processHeartbeat(receivedAt: Date): void {
    const now = receivedAt.getTime();

    // Actualizar estado del dispositivo
    this.deviceStatus.isOnline = true;
    this.deviceStatus.lastSeen = receivedAt;
    this.deviceStatus.timeSinceLastBeat = 0;
    this.deviceStatus.totalBeats++;

    // Calcular beats consecutivos
    if (this.lastHeartbeatTime > 0) {
      const interval = now - this.lastHeartbeatTime;
      if (interval < this.HEARTBEAT_TIMEOUT) {
        this.deviceStatus.consecutiveBeats++;
      } else {
        this.deviceStatus.consecutiveBeats = 1; // Reiniciar contador
      }

      // Mantener historial de intervalos para calcular promedio
      this.heartbeatHistory.push(interval);
      if (this.heartbeatHistory.length > 10) {
        this.heartbeatHistory.shift(); // Mantener solo los últimos 10
      }

      // Calcular promedio
      this.deviceStatus.averageInterval =
        this.heartbeatHistory.reduce((a, b) => a + b, 0) / this.heartbeatHistory.length;
    } else {
      this.deviceStatus.consecutiveBeats = 1;
    }

    this.lastHeartbeatTime = now;
  }

  private startStatusChecker(): void {
    // Verificar cada segundo si el dispositivo sigue online
    this.statusCheckInterval = setInterval(() => {
      this.updateDeviceStatus();
    }, 1000);
  }

  private updateDeviceStatus(): void {
    if (!this.deviceStatus.lastSeen) return;

    const now = new Date().getTime();
    const timeSince = now - this.deviceStatus.lastSeen.getTime();
    this.deviceStatus.timeSinceLastBeat = timeSince;

    // Si han pasado más de 5 segundos sin heartbeat, marcar como offline
    if (timeSince > this.HEARTBEAT_TIMEOUT) {
      this.deviceStatus.isOnline = false;
      this.deviceStatus.consecutiveBeats = 0;
    }
  }

  // Métodos para la UI
  getDeviceStatusClass(): string {
    if (!this.isConnected) return 'mqtt-disconnected';
    if (!this.deviceStatus.lastSeen) return 'never-connected';
    if (this.deviceStatus.isOnline) return 'online';
    return 'offline';
  }

  getStatusTitle(): string {
    if (!this.isConnected) return 'MQTT Desconectado';
    if (!this.deviceStatus.lastSeen) return 'Esperando Dispositivo';
    if (this.deviceStatus.isOnline) return 'ESP32 Conectado';
    return 'ESP32 Desconectado';
  }

  getStatusSubtitle(): string {
    if (!this.isConnected) return 'Conecta al broker MQTT';
    if (!this.deviceStatus.lastSeen) return 'Sin heartbeat recibido';
    if (this.deviceStatus.isOnline) return 'Heartbeat activo';
    return `Offline hace ${this.formatTimeSince(this.deviceStatus.timeSinceLastBeat)}`;
  }

  getClientId(): string {
    return this.heartbeatData?.client_id || 'Unknown';
  }

  getUptime(): string {
    if (!this.heartbeatData) return '0s';
    return this.formatUptime(this.heartbeatData.timestamp);
  }

  formatTimeSince(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  formatInterval(ms: number): string {
    return `${Math.round(ms)}ms`;
  }

  getConnectionQuality(): 'excellent' | 'good' | 'poor' | 'critical' {
    if (!this.deviceStatus.isOnline) return 'critical';

    const avgInterval = this.deviceStatus.averageInterval;
    const expectedInterval = this.EXPECTED_INTERVAL;

    if (Math.abs(avgInterval - expectedInterval) < 200) return 'excellent';
    if (Math.abs(avgInterval - expectedInterval) < 500) return 'good';
    return 'poor';
  }

  getQualityColor(): string {
    const quality = this.getConnectionQuality();
    switch (quality) {
      case 'excellent': return 'success';
      case 'good': return 'success';
      case 'poor': return 'warning';
      default: return 'danger';
    }
  }

  getQualityDescription(): string {
    const quality = this.getConnectionQuality();
    switch (quality) {
      case 'excellent': return 'Excelente';
      case 'good': return 'Buena';
      case 'poor': return 'Irregular';
      default: return 'Crítica';
    }
  }

  // Verificar si los datos están frescos
  isDataFresh(): boolean {
    return this.deviceStatus.isOnline && this.deviceStatus.timeSinceLastBeat < 3000;
  }
}
