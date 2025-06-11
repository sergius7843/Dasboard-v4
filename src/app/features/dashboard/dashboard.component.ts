import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../shared/components/header/header.component';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { MemoryCardComponent } from './components/memory-card/memory-card.component';
import {WiFiCardComponent} from './components/wifi-card/wifi-card.component';
import {HeartbeatCardComponent} from './components/heartbeat-card/heartbeat-card.component';
import {TemperatureCardComponent} from './components/temperature-card/temperature-card.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    NavbarComponent,
    FooterComponent,
    MemoryCardComponent,
    WiFiCardComponent,
    HeartbeatCardComponent,
    TemperatureCardComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {

  constructor() {}

  ngOnInit(): void {
    console.log('Dashboard component initialized');
  }

  ngOnDestroy(): void {
    console.log('Dashboard component destroyed');
  }
}
