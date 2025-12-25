export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface INotificationService {
  sendMessage(message: string, title?: string, additional?: EmbedField[]): Promise<void>;
  sendErrorReport(error: Error): Promise<void>;
}

export const NotificationPort = Symbol('NotificationPort');
