export type Contact = {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: 'Active' | 'Inactive';
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  body: string;
  variables: number;
  headerType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | null;
};

export type RecipientStatus = {
  id: string;
  name: string;
  phone: string;
  status: 'Queued' | 'Processing' | 'Sent' | 'Delivered' | 'Read' | 'Failed' | 'Cancelled';
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  error?: string | null;
};

export type CampaignSummary = {
  id: string;
  name: string;
  templateName: string;
  status: string;
  scheduledAt?: string | null;
  timezone?: string | null;
  canceledAt?: string | null;
  schedulerError?: string | null;
  createdAt: string;
  totalRecipients: number;
};

export type ManagedWhatsAppTemplate = {
  id: string;
  providerTemplateId?: string | null;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string;
  body: string;
  footer?: string | null;
  status: 'DRAFT' | 'APPROVED' | 'SUBMITTED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string;
  variables: number;
  headerType?: 'IMAGE' | 'VIDEO' | null;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecurringCampaignSummary = {
  id: string;
  name: string;
  templateName: string;
  status: 'active' | 'paused' | 'completed' | 'canceled' | string;
  timezone: string;
  startAt: string;
  nextRunAt?: string | null;
  totalDays: number;
  runsCreated: number;
  lastRunAt?: string | null;
  schedulerError?: string | null;
  createdAt: string;
  totalRecipients: number;
};

export type MessageSeriesStep = {
  id?: string;
  dayNumber: number;
  templateName: string;
  templateLanguage: string;
  headerType?: 'IMAGE' | 'VIDEO' | null;
  mediaUrl?: string | null;
  variableValues: Record<string, string>;
};

export type MessageSeries = {
  id: string;
  name: string;
  description?: string | null;
  status: 'READY' | 'INACTIVE' | string;
  createdAt: string;
  updatedAt: string;
  steps: MessageSeriesStep[];
};

export type MessageSeriesScheduleSummary = {
  id: string;
  seriesId: string;
  seriesName: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'canceled' | string;
  timezone: string;
  startAt: string;
  nextRunAt?: string | null;
  totalDays: number;
  runsCreated: number;
  lastRunAt?: string | null;
  schedulerError?: string | null;
  createdAt: string;
  totalRecipients: number;
};

export type TemplateFolder = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
