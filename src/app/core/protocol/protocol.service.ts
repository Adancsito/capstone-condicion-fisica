import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Protocol } from './protocol.types';

export const PROTOCOL_URL = 'protocols/protocol.json';

@Injectable({ providedIn: 'root' })
export class ProtocolService {
  private readonly http = inject(HttpClient);
  readonly protocol = signal<Protocol | null>(null);
  readonly failed = signal(false);

  async load(): Promise<Protocol | null> {
    if (this.protocol()) {
      return this.protocol();
    }
    try {
      const p = await firstValueFrom(this.http.get<Protocol>(PROTOCOL_URL));
      this.protocol.set(p);
      return p;
    } catch {
      this.failed.set(true);
      return null;
    }
  }
}
