import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MqttClientService } from '../../../../core/services/mqtt-client.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface MemoryData {
  memory: {
    heap: {
      total: number;
      free: number;
      used: number;
    };
    flash: {
      total: number;
      used: number;
      free: number;
    };
    uptime_ms: number;
  };
}

@Component({
  selector: 'app-memory-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './memory-card.component.html',
  styleUrl: './memory-card.component.css'
})
export class MemoryCardComponent implements OnInit, OnDestroy {

  memoryData: MemoryData | null = null;
  isConnected: boolean = false;
  lastUpdate: Date | null = null;
  private subscription: Subscription = new Subscription();

  constructor(private mqttService: MqttClientService) {}

  ngOnInit(): void {
    this.subscribeToMemoryData();
    this.subscribeToConnectionStatus();

    // Suscribirse al topic de memoria
    if (this.mqttService.isConnected) {
      this.mqttService.subscribe('esp32/system/memory');
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.mqttService.isConnected) {
      this.mqttService.unsubscribe('esp32/system/memory');
    }
  }

  private subscribeToMemoryData(): void {
    const messagesSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg => msg.topic === 'esp32/system/memory'))
      )
      .subscribe(messages => {
        const memoryMessage = messages
          .filter(msg => msg.topic === 'esp32/system/memory')
          .pop(); // Obtener el mensaje más reciente

        if (memoryMessage) {
          try {
            this.memoryData = JSON.parse(memoryMessage.payload);
            this.lastUpdate = memoryMessage.timestamp;
          } catch (error) {
            console.error('Error parsing memory data:', error);
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
        this.mqttService.subscribe('esp32/system/memory');
      }
    });

    this.subscription.add(connectionSub);
  }

  // Métodos para calcular porcentajes
  getHeapUsagePercentage(): number {
    if (!this.memoryData) return 0;
    const { heap } = this.memoryData.memory;
    return Math.round((heap.used / heap.total) * 100);
  }

  getFlashUsagePercentage(): number {
    if (!this.memoryData) return 0;
    const { flash } = this.memoryData.memory;
    return Math.round((flash.used / flash.total) * 100);
  }

  // Formatear bytes a unidades legibles
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Formatear uptime
  formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Determinar color según uso
  getUsageColor(percentage: number): string {
    if (percentage < 50) return 'success';
    if (percentage < 80) return 'warning';
    return 'danger';
  }

  // Verificar si los datos están actualizados (menos de 10 segundos)
  isDataFresh(): boolean {
    if (!this.lastUpdate) return false;
    const now = new Date();
    const diffMs = now.getTime() - this.lastUpdate.getTime();
    return diffMs < 10000; // 10 segundos
  }
}
