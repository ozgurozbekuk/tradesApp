export type ToolExecutionContext = {
  userId: string;
};

export type ToolAttachment = {
  type: "pdf";
  mediaUrl: string;
  filename?: string;
};

export type ToolResult = {
  success: boolean;
  message?: string;
  data?: unknown;
  attachment?: ToolAttachment;
};

export type AppTool<TArgs extends Record<string, unknown> = Record<string, unknown>> = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<ToolResult>;
};
