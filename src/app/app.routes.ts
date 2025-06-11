import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component')
      .then(m => m.DashboardComponent),
    title: 'Dashboard - MQTT Client'
  },
  {
    path: 'esp32',
    loadComponent: () => import('./features/esp32/esp32.component')
      .then(m => m.Esp32Component),
    title: 'ESP32 - MQTT Client'
  },
  {
    path: 'control',
    loadComponent: () => import('./features/control/control.component')
      .then(m => m.ControlComponent),
    title: 'Control - MQTT Client'
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
