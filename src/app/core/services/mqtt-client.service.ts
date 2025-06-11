import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import mqtt from 'mqtt';

export interface MqttMessage {
  topic: string;
  payload: string;
  timestamp: Date;
}

export interface ConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MqttClientService {
  private client: mqtt.MqttClient | null = null;
  private readonly brokerUrl = 'ws://localhost:9001';
  
  // Subjects para manejo de estado
  private messagesSubject = new BehaviorSubject<MqttMessage[]>([]);
  private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>({
    connected: false,
    reconnecting: false
  });

  // Observables públicos
  public messages$ = this.messagesSubject.asObservable();
  public connectionStatus$ = this.connectionStatusSubject.asObservable();

  constructor() {
    // Auto-conectar al servicio (opcional)
    // this.connect();
  }

  /**
   * Conectar al broker MQTT
   */
  connect(): void {
    if (this.client && this.client.connected) {
      console.log('Ya existe una conexión activa');
      return;
    }

    try {
      this.updateConnectionStatus({ connected: false, reconnecting: true });
      
      this.client = mqtt.connect(this.brokerUrl, {
        clientId: `angular-mqtt-${Math.random().toString(16).substr(2, 8)}`,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
      });

      this.setupEventHandlers();
      
    } catch (error) {
      console.error('Error al conectar con MQTT:', error);
      this.updateConnectionStatus({ 
        connected: false, 
        reconnecting: false, 
        error: 'Error de conexión' 
      });
    }
  }

  /**
   * Desconectar del broker
   */
  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.updateConnectionStatus({ connected: false, reconnecting: false });
    }
  }

  /**
   * Publicar mensaje a un topic
   */
  publish(topic: string, message: string): void {
    if (this.client && this.client.connected) {
      this.client.publish(topic, message, (error) => {
        if (error) {
          console.error('Error al publicar mensaje:', error);
        } else {
          console.log(`Mensaje publicado en ${topic}:`, message);
        }
      });
    } else {
      console.warn('Cliente MQTT no conectado');
    }
  }

  /**
   * Suscribirse a un topic
   */
  subscribe(topic: string): void {
    if (this.client && this.client.connected) {
      this.client.subscribe(topic, (error) => {
        if (error) {
          console.error('Error al suscribirse al topic:', error);
        } else {
          console.log('Suscrito al topic:', topic);
        }
      });
    } else {
      console.warn('Cliente MQTT no conectado');
    }
  }

  /**
   * Desuscribirse de un topic
   */
  unsubscribe(topic: string): void {
    if (this.client && this.client.connected) {
      this.client.unsubscribe(topic, (error) => {
        if (error) {
          console.error('Error al desuscribirse del topic:', error);
        } else {
          console.log('Desuscrito del topic:', topic);
        }
      });
    }
  }

  /**
   * Obtener estado de conexión actual
   */
  get isConnected(): boolean {
    return this.client?.connected || false;
  }

  /**
   * Obtener lista de mensajes recibidos
   */
  get messages(): MqttMessage[] {
    return this.messagesSubject.value;
  }

  /**
   * Limpiar historial de mensajes
   */
  clearMessages(): void {
    this.messagesSubject.next([]);
  }

  // Métodos privados
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      console.log('Conectado al broker MQTT');
      this.updateConnectionStatus({ connected: true, reconnecting: false });
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      const message: MqttMessage = {
        topic,
        payload: payload.toString(),
        timestamp: new Date()
      };
      
      this.addMessage(message);
      console.log('Mensaje recibido:', message);
    });

    this.client.on('error', (error) => {
      console.error('Error MQTT:', error);
      this.updateConnectionStatus({ 
        connected: false, 
        reconnecting: false, 
        error: error.message 
      });
    });

    this.client.on('offline', () => {
      console.log('Cliente MQTT offline');
      this.updateConnectionStatus({ connected: false, reconnecting: true });
    });

    this.client.on('reconnect', () => {
      console.log('Reintentando conexión MQTT...');
      this.updateConnectionStatus({ connected: false, reconnecting: true });
    });

    this.client.on('close', () => {
      console.log('Conexión MQTT cerrada');
      this.updateConnectionStatus({ connected: false, reconnecting: false });
    });
  }

  private updateConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatusSubject.next(status);
  }

  private addMessage(message: MqttMessage): void {
    const currentMessages = this.messagesSubject.value;
    const updatedMessages = [...currentMessages, message];
    
    // Mantener solo los últimos 100 mensajes
    if (updatedMessages.length > 100) {
      updatedMessages.shift();
    }
    
    this.messagesSubject.next(updatedMessages);
  }
}