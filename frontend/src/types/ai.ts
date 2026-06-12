export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  a2ui?: A2uiSurface;
}

export interface AiClientAction {
  type: string;
  payload?: Record<string, unknown>;
}

export interface AiChatResponse {
  reply: string;
  actions: AiClientAction[];
  a2ui?: A2uiSurface;
}

export interface A2uiAction {
  name: string;
  payload?: Record<string, unknown>;
}

export interface A2uiListItem {
  id?: string;
  primaryText: string;
  secondaryText?: string;
  action?: A2uiAction;
}

export interface A2uiComponent {
  id: string;
  type: 'Column' | 'Row' | 'Text' | 'Button' | 'List' | 'Card';
  text?: string;
  label?: string;
  variant?: 'heading' | 'body' | 'caption';
  children?: string[];
  child?: string;
  items?: A2uiListItem[];
  action?: A2uiAction;
}

export interface A2uiSurface {
  version?: string;
  surfaceId?: string;
  components: A2uiComponent[];
}
