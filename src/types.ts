export type ContactSource = 'sheet' | 'flowlu';

export type Contact = {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: 'Active' | 'Inactive';
  source?: ContactSource;
  flowluId?: number;
  categoryId?: number | null;
  email?: string | null;
  description?: string | null;
  address?: string | null;
  ownerId?: number | null;
  sourceUpdatedAt?: string | null;
};

export type FlowluOption = {
  id: number;
  name: string;
  active: boolean;
  pipelineId?: number | null;
  ordering?: number;
  color?: string | null;
};

export type FlowluSalesMeta = {
  pipelines: FlowluOption[];
  stages: FlowluOption[];
  sources: FlowluOption[];
  users: FlowluOption[];
};

export type FlowluLeadContext = {
  accountId: number;
  leadId: number;
  leadName: string;
  pipelineId: number | null;
  stageId: number | null;
  budget: number;
  assigneeId: number | null;
  sourceId: number | null;
  status: 'in_progress' | 'lost' | 'won';
  accountName?: string;
  accountPhone?: string;
  startDate?: string;
  deadline?: string;
  commentCount?: number;
};

export type FlowluLossReason = {
  id: number;
  name: string;
  active: boolean;
};

export type FlowluOpportunity = {
  id: number;
  name: string;
  active: number;
  pipelineId: number | null;
  stageId: number | null;
  sourceId: number | null;
  assigneeId: number | null;
  budget: number;
  description: string;
  startDate: string;
  deadline: string;
  closingDate: string;
  closingStatusId: number | null;
  closingComment: string;
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
  deliveryStatus?: string;
  scheduledAt?: string | null;
  timezone?: string | null;
  canceledAt?: string | null;
  schedulerError?: string | null;
  createdAt: string;
  totalRecipients: number;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  failedCount?: number;
  queuedCount?: number;
  processingCount?: number;
  cancelledCount?: number;
};

export type CampaignRecipient = {
  id: string;
  campaignId: string;
  contactId: string;
  contactName: string;
  phone: string;
  status: RecipientStatus['status'];
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  error?: string | null;
};

export type CampaignDetail = {
  campaign: CampaignSummary;
  recipients: CampaignRecipient[];
};

export type CampaignSettings = {
  id: string;
  campaignId: string;
  timezone: string;
  dailySendTime: string;
  intervalDays: number;
  startDate: string;
  endDate?: string | null;
  maxRecipientsPerBatch?: number | null;
};

export type StaffRole = 'admin' | 'team';

export type StaffProfile = {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  mustSetPassword: boolean;
};
