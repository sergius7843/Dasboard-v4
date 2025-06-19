import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MqttClientService } from '../../../../core/services/mqtt-client.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface LdrData {
  ldr_raw: number;
  timestamp: number;
}

export interface LdrStats {
  current: number;
  min: number;
  max: number;
  average: number;
  lightLevel: 'very-dark' | 'dark' | 'dim' | 'bright' | 'very-bright';
  lastChange: number;
  lightPercentage: number;
}

@Component({
  selector: 'app-ldr-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ldr-card.component.html',
  styleUrl: './ldr-card.component.css'
})
export class LdrCardComponent implements OnInit, OnDestroy {

  ldrData: LdrData | null = null;
  ldrStats: LdrStats = {
    current: 0,
    min: Infinity,
    max: -Infinity,
    average: 0,
    lightLevel: 'dark',
    lastChange: 0,
    lightPercentage: 0
  };

  isConnected: boolean = false;
  lastUpdate: Date | null = null;
  private subscription: Subscription = new Subscription();
  private ldrHistory: number[] = []; // últimas 20 lecturas
  private previousLdrValue: number | null = null;

  constructor(private mqttService: MqttClientService) {}

  ngOnInit(): void {
    this.subscribeToLdrData();
    this.subscribeToConnectionStatus();

    // Suscribirse al topic del LDR
    if (this.mqttService.isConnected) {
      this.mqttService.subscribe('esp32/sensors/ldr');
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.mqttService.isConnected) {
      this.mqttService.unsubscribe('esp32/sensors/ldr');
    }
  }

  private subscribeToLdrData(): void {
    const messagesSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg => msg.topic === 'esp32/sensors/ldr'))
      )
      .subscribe(messages => {
        const ldrMessage = messages
          .filter(msg => msg.topic === 'esp32/sensors/ldr')
          .pop(); // Obtener el mensaje más reciente

        if (ldrMessage) {
          try {
            this.ldrData = JSON.parse(ldrMessage.payload);
            this.processLdrReading(this.ldrData!.ldr_raw, ldrMessage.timestamp);
          } catch (error) {
            console.error('Error parsing LDR data:', error);
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
        this.mqttService.subscribe('esp32/sensors/ldr');
      }
    });

    this.subscription.add(connectionSub);
  }

  private processLdrReading(ldrValue: number, timestamp: Date): void {
    this.lastUpdate = timestamp;

    // Actualizar estadísticas
    this.ldrStats.current = ldrValue;

    // Calcular cambio desde la lectura anterior
    if (this.previousLdrValue !== null) {
      this.ldrStats.lastChange = ldrValue - this.previousLdrValue;
    }

    this.previousLdrValue = ldrValue;

    // Actualizar min/max
    this.ldrStats.min = Math.min(this.ldrStats.min, ldrValue);
    this.ldrStats.max = Math.max(this.ldrStats.max, ldrValue);

    // Mantener historial de valores
    this.ldrHistory.push(ldrValue);
    if (this.ldrHistory.length > 20) {
      this.ldrHistory.shift(); // Mantener solo las últimas 20
    }

    // Calcular promedio
    this.ldrStats.average =
      this.ldrHistory.reduce((sum, val) => sum + val, 0) / this.ldrHistory.length;

    // Determinar nivel de luz y porcentaje
    this.calculateLightLevel(ldrValue);
  }

  private calculateLightLevel(ldrValue: number): void {
    // Convertir valor ADC (0-4095) a porcentaje de luz
    // Valores más bajos = más luz (lógica inversa del LDR)
    this.ldrStats.lightPercentage = ((4095 - ldrValue) / 4095) * 100;

    // Determinar nivel de luz basado en el valor (lógica inversa)
    if (ldrValue <= 500) {
      this.ldrStats.lightLevel = 'very-bright'; // Mucha luz
    } else if (ldrValue <= 1500) {
      this.ldrStats.lightLevel = 'bright'; // Luz día
    } else if (ldrValue <= 2500) {
      this.ldrStats.lightLevel = 'dim'; // Atardecer/amanecer
    } else if (ldrValue <= 3500) {
      this.ldrStats.lightLevel = 'dark'; // Oscuro
    } else {
      this.ldrStats.lightLevel = 'very-dark'; // Muy oscuro/noche
    }
  }

  // Métodos para la UI
  formatLdrValue(value: number): string {
    return value.toString();
  }

  getLightColor(): string {
    switch (this.ldrStats.lightLevel) {
      case 'very-bright': return 'warning';    // Amarillo brillante (día)
      case 'bright': return 'success';         // Verde (día claro)
      case 'dim': return 'primary';            // Azul (atardecer)
      case 'dark': return 'dark';              // Gris (oscuro)
      case 'very-dark': return 'danger';       // Rojo (noche)
      default: return 'dark';
    }
  }

  getLightStatus(): string {
    switch (this.ldrStats.lightLevel) {
      case 'very-bright': return 'Muy Brillante';
      case 'bright': return 'Brillante';
      case 'dim': return 'Tenue';
      case 'dark': return 'Oscuro';
      case 'very-dark': return 'Muy Oscuro';
      default: return 'Desconocido';
    }
  }

  getLightIcon(): string {
    switch (this.ldrStats.lightLevel) {
      case 'very-bright': 
      case 'bright': 
        return 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'; // Sol
      case 'dim':
        return 'M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z'; // Media luna
      case 'dark':
      case 'very-dark':
        return 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z'; // Luna
      default:
        return 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z';
    }
  }

  getChangeIcon(): string {
    if (this.ldrStats.lastChange < -100) {
      return 'M7 14l5-5 5 5'; // Subiendo (menos ADC = más luz)
    } else if (this.ldrStats.lastChange > 100) {
      return 'M17 10l-5 5-5-5'; // Bajando (más ADC = menos luz)
    } else {
      return 'M5 12h14'; // Estable
    }
  }

  getChangeColor(): string {
    if (this.ldrStats.lastChange < -100) {
      return 'text-warning-500'; // Más luz = amarillo
    } else if (this.ldrStats.lastChange > 100) {
      return 'text-primary-500'; // Menos luz = azul
    } else {
      return 'text-success-500'; // Estable = verde
    }
  }

  getChangeDescription(): string {
    if (this.ldrStats.lastChange < -100) {
      return 'Más Luz';
    } else if (this.ldrStats.lastChange > 100) {
      return 'Menos Luz';
    } else {
      return 'Estable';
    }
  }

  // Verificar si los datos están actualizados (menos de 10 segundos)
  isDataFresh(): boolean {
    if (!this.lastUpdate) return false;
    const now = new Date();
    const diffMs = now.getTime() - this.lastUpdate.getTime();
    return diffMs < 10000; // 10 segundos
  }

  // Calcular el rango de valores LDR (max - min)
  getLdrRange(): number {
    if (this.ldrStats.min === Infinity) return 0;
    return this.ldrStats.max - this.ldrStats.min;
  }

  // Obtener estado de la card
  getCardStatusClass(): string {
    if (!this.isConnected) return 'mqtt-disconnected';
    if (!this.isDataFresh()) return 'stale-data';
    return this.getLightColor();
  }

  // Verificar si hay datos históricos suficientes
  hasHistoricalData(): boolean {
    return this.ldrHistory.length >= 2;
  }

  // Formatear el uptime del sensor
  getSensorUptime(): string {
    if (!this.ldrData) return '0s';
    return this.formatUptime(this.ldrData.timestamp);
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Obtener porcentaje formateado
  getFormattedPercentage(): string {
    return this.ldrStats.lightPercentage.toFixed(1) + '%';
  }

  // Verificar si es de día o noche
  isDayTime(): boolean {
    return this.ldrStats.lightLevel === 'bright' || this.ldrStats.lightLevel === 'very-bright';
  }

  isNightTime(): boolean {
    return this.ldrStats.lightLevel === 'dark' || this.ldrStats.lightLevel === 'very-dark';
  }
}