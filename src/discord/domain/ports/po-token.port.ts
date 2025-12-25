export interface PoTokenData {
  poToken: string;
  visitorData: string;
  generatedAt: Date;
}

export interface IPoTokenService {
  getPoToken(): PoTokenData | null;
  refreshPoToken(): Promise<PoTokenData>;
  isTokenValid(): boolean;
}

export const PoTokenServicePort = Symbol('PoTokenServicePort');
