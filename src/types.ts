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
  status: 'Queued' | 'Processing' | 'Sent' | 'Delivered' | 'Read' | 'Failed';
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
  createdAt: string;
  updatedAt: string;
};
