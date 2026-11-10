/** Desarrollo: se permite el paquete de demostración, siempre rotulado en pantalla. */
export const environment = {
  production: false,
  demoAllowed: true,
  bundleUrl: 'model-bundles/current.json',
  demoBundleUrl: 'model-bundles/demo.json',
  /** Configuración web de Firebase. Estos valores identifican el proyecto y no son secretos: la protección está en las reglas de Firestore. */
  firebase: {
    apiKey: 'AIzaSyCKoo53j_jKvl8988jY3dVg149CrgyMq-o',
    authDomain: 'casptone-d2321.firebaseapp.com',
    projectId: 'casptone-d2321',
    storageBucket: 'casptone-d2321.firebasestorage.app',
    messagingSenderId: '824087936706',
    appId: '1:824087936706:web:f6a6f18e7581390933c55b',
    measurementId: 'G-YB9HXC0C1Z',
  },
};
