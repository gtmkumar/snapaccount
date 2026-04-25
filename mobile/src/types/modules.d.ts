/**
 * Type declarations for native modules that ship their own types after npm install.
 * These shims satisfy tsc --noEmit in environments where node_modules is not yet
 * populated (e.g. CI lint-only runs). They are intentionally minimal — the real
 * types ship with each package and take precedence once the packages are installed.
 */

// react-native-ssl-pinning (SEC-014)
// Real types: https://github.com/MaxToyberman/react-native-ssl-pinning
declare module 'react-native-ssl-pinning' {
  interface SslPinningOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    sslPinning?: {
      certs: string[];
    };
    timeoutInterval?: number;
  }

  interface SslPinningResponse {
    status: number;
    bodyString: string;
    headers: Record<string, string>;
  }

  const SslPinning: {
    fetch(url: string, options: SslPinningOptions): Promise<SslPinningResponse>;
  };

  export default SslPinning;
}

// expo-screen-capture (SEC-015)
// Real types ship with expo-screen-capture after npm install
declare module 'expo-screen-capture' {
  /**
   * Activates OS-level screenshot prevention for the calling component's lifetime.
   * On Android sets FLAG_SECURE; on iOS uses secure overlay mechanism.
   */
  export function usePreventScreenCapture(): void;

  /**
   * Imperatively activate screenshot prevention.
   */
  export function activateKeepAwake(tag?: string): void;

  /**
   * Imperatively deactivate screenshot prevention.
   */
  export function deactivateKeepAwake(tag?: string): void;
}
