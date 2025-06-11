import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent implements OnInit, OnDestroy {

  currentYear: number = new Date().getFullYear();
  isVisible: boolean = false;

  constructor() {}

  ngOnInit(): void {
    this.checkScrollPosition();
  }

  ngOnDestroy(): void {}

  @HostListener('window:scroll', ['$event'])
  onScroll(): void {
    this.checkScrollPosition();
  }

  @HostListener('window:resize', ['$event'])
  onResize(): void {
    this.checkScrollPosition();
  }

  private checkScrollPosition(): void {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    // El footer se muestra cuando estás cerca del final (80% del scroll)
    const scrollPercentage = (scrollTop + windowHeight) / documentHeight;
    this.isVisible = scrollPercentage >= 0.95;
  }

  getAppInfo(): { name: string; version: string; buildDate: string } {
    return {
      name: 'MQTT Dashboard',
      version: '1.0.0',
      buildDate: '2025'
    };
  }
}
