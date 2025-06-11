import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zone.js optimizations
    provideZoneChangeDetection({ eventCoalescing: true }),
    
    // Router configuration
    provideRouter(routes),
    
    // Animations para transiciones suaves
    provideAnimations(),
    
    // HTTP Client para futuras integraciones
    provideHttpClient(withInterceptorsFromDi()),
  ]
};