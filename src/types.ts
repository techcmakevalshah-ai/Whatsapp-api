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
