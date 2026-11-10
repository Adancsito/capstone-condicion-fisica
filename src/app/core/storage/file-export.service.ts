import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Entrega un archivo al evaluador. En el navegador lo descarga; en el teléfono (Capacitor) lo guarda en la caché de la aplicación y abre
 * el menú de compartir, porque una descarga normal no funciona dentro de la vista web de Android.
 */
@Injectable({ providedIn: 'root' })
export class FileExportService {
  async save(name: string, content: string, mime: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const file = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: name, dialogTitle: 'Exportar sesiones', url: file.uri });
      return;
    }
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
