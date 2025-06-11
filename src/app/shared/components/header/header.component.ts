import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MqttClientService, ConnectionStatus } from '../../../core/services/mqtt-client.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {

  connectionStatus$: Observable<ConnectionStatus>;
  currentTime: string = '';
  private timeInterval: any;

  constructor(private mqttService: MqttClientService) {
    this.connectionStatus$ = this.mqttService.connectionStatus$;
  }

  ngOnInit(): void {
    this.updateTime();
    this.timeInterval = setInterval(() => {
      this.updateTime();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }

  private updateTime(): void {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  onConnectMqtt(): void {
    this.mqttService.connect();
  }

  onDisconnectMqtt(): void {
    this.mqttService.disconnect();
  }

  getStatusTitle(status: ConnectionStatus): string {
    if (status.connected) return 'Sistema Conectado';
    if (status.reconnecting) return 'Estableciendo Conexión';
    return 'Sistema Desconectado';
  }

  getStatusSubtitle(status: ConnectionStatus): string {
    if (status.connected) return 'Operativo • Tiempo real';
    if (status.reconnecting) return 'Reintentando conexión...';
    return 'Presiona conectar para iniciar';
  }
}
