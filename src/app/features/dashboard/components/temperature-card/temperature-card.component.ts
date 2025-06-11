import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MqttClientService } from '../../../../core/services/mqtt-client.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface TemperatureData {
  temperature_c: number;
  adc: number;
  timestamp: number;
}

export interface TemperatureStats {
  current: number;
  min: number;
  max: number;
  average: number;
  trend: 'up' | 'down' | 'stable';
  lastChange: number; // diferencia con la lectura anterior
}

@Component({
  selector: 'app-temperature-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './temperature-card.component.html',
  styleUrl: './temperature-card.component.css'
})
export class TemperatureCardComponent implements OnInit, OnDestroy {

  temperatureData: TemperatureData | null = null;
  temperatureStats: TemperatureStats = {
    current: 0,
    min: Infinity,
    max: -Infinity,
    average: 0,
    trend: 'stable',
    lastChange: 0
  };

  isConnected: boolean = false;
  lastUpdate: Date | null = null;
  private subscription: Subscription = new Subscription();
  private temperatureHistory: number[] = []; // últimas 20 lecturas
  private previousTemperature: number | null = null;

  constructor(private mqttService: MqttClientService) {}

  ngOnInit(): void {
    this.subscribeToTemperatureData();
    this.subscribeToConnectionStatus();

    // Suscribirse al topic de temperatura
    if (this.mqttService.isConnected) {
      this.mqttService.subscribe('esp32/sensors/temperature');
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.mqttService.isConnected) {
      this.mqttService.unsubscribe('esp32/sensors/temperature');
    }
  }

  private subscribeToTemperatureData(): void {
    const messagesSub = this.mqttService.messages$
      .pipe(
        filter(messages => messages.some(msg => msg.topic === 'esp32/sensors/temperature'))
      )
      .subscribe(messages => {
        const tempMessage = messages
          .filter(msg => msg.topic === 'esp32/sensors/temperature')
          .pop(); // Obtener el mensaje más reciente

        if (tempMessage) {
          try {
            this.temperatureData = JSON.parse(tempMessage.payload);
            this.processTemperatureReading(this.temperatureData!.temperature_c, tempMessage.timestamp);
          } catch (error) {
            console.error('Error parsing temperature data:', error);
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
        this.mqttService.subscribe('esp32/sensors/temperature');
      }
    });

    this.subscription.add(connectionSub);
  }

  private processTemperatureReading(temperature: number, timestamp: Date): void {
    this.lastUpdate = timestamp;

    // Actualizar estadísticas
    this.temperatureStats.current = temperature;

    // Calcular cambio desde la lectura anterior
    if (this.previousTemperature !== null) {
      this.temperatureStats.lastChange = temperature - this.previousTemperature;

      // Determinar tendencia (con umbral de 0.2°C para evitar fluctuaciones menores)
      if (Math.abs(this.temperatureStats.lastChange) < 0.2) {
        this.temperatureStats.trend = 'stable';
      } else if (this.temperatureStats.lastChange > 0) {
        this.temperatureStats.trend = 'up';
      } else {
        this.temperatureStats.trend = 'down';
      }
    }

    this.previousTemperature = temperature;

    // Actualizar min/max
    this.temperatureStats.min = Math.min(this.temperatureStats.min, temperature);
    this.temperatureStats.max = Math.max(this.temperatureStats.max, temperature);

    // Mantener historial de temperaturas
    this.temperatureHistory.push(temperature);
    if (this.temperatureHistory.length > 20) {
      this.temperatureHistory.shift(); // Mantener solo las últimas 20
    }

    // Calcular promedio
    this.temperatureStats.average =
      this.temperatureHistory.reduce((sum, temp) => sum + temp, 0) / this.temperatureHistory.length;
  }

  // Métodos para la UI
  formatTemperature(temp: number): string {
    return temp.toFixed(1);
  }

  getTemperatureColor(): string {
    const temp = this.temperatureStats.current;
    if (temp >= 35) return 'danger';   // Muy caliente
    if (temp >= 25) return 'warning';  // Caliente
    if (temp >= 15) return 'success';  // Normal
    if (temp >= 5) return 'info';      // Frío
    return 'danger';                   // Muy frío
  }

  getTemperatureStatus(): string {
    const temp = this.temperatureStats.current;
    if (temp >= 35) return 'Muy Caliente';
    if (temp >= 25) return 'Caliente';
    if (temp >= 15) return 'Normal';
    if (temp >= 5) return 'Frío';
    return 'Muy Frío';
  }

  getTrendIcon(): string {
    switch (this.temperatureStats.trend) {
      case 'up': return 'M7 14l3-3 3 3m-6 0l3-3 3 3M5 12h14';
      case 'down': return 'M17 10l-3 3-3-3m6 0l-3 3-3-3m6-6H5';
      default: return 'M5 12h14';
    }
  }

  getTrendColor(): string {
    switch (this.temperatureStats.trend) {
      case 'up': return 'text-danger-400';
      case 'down': return 'text-primary-400';
      default: return 'text-success-400';
    }
  }

  getTrendDescription(): string {
    switch (this.temperatureStats.trend) {
      case 'up': return 'Subiendo';
      case 'down': return 'Bajando';
      default: return 'Estable';
    }
  }

  // Obtener porcentaje para el termómetro visual (rango -10°C a 50°C)
  getTemperaturePercentage(): number {
    const temp = this.temperatureStats.current;
    const minRange = -10;
    const maxRange = 50;
    const percentage = ((temp - minRange) / (maxRange - minRange)) * 100;
    return Math.max(0, Math.min(100, percentage));
  }

  // Verificar si los datos están actualizados (menos de 10 segundos)
  isDataFresh(): boolean {
    if (!this.lastUpdate) return false;
    const now = new Date();
    const diffMs = now.getTime() - this.lastUpdate.getTime();
    return diffMs < 10000; // 10 segundos
  }

  // Obtener el valor ADC formateado
  getAdcValue(): number {
    return this.temperatureData?.adc || 0;
  }

  // Calcular el rango de temperatura (max - min)
  getTemperatureRange(): number {
    if (this.temperatureStats.min === Infinity) return 0;
    return this.temperatureStats.max - this.temperatureStats.min;
  }

  // Obtener estado de la card
  getCardStatusClass(): string {
    if (!this.isConnected) return 'mqtt-disconnected';
    if (!this.isDataFresh()) return 'stale-data';
    return this.getTemperatureColor();
  }

  // Verificar si hay datos históricos suficientes
  hasHistoricalData(): boolean {
    return this.temperatureHistory.length >= 2;
  }

  // Formatear el uptime del sensor
  getSensorUptime(): string {
    if (!this.temperatureData) return '0s';
    return this.formatUptime(this.temperatureData.timestamp);
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
}
