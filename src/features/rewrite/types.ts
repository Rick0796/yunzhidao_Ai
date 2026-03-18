export interface RewriteAnalysisBreakdown {
  hook: string;
  contrast: string;
  value: string;
  trust: string;
  cta: string;
  targetAudience: string;
  sellingPoints: string;
}

export interface RewriteGeneratedScript {
  title: string;
  content: string;
}

export interface RewriteCopyResult {
  originalCopy?: string;
  analysis: RewriteAnalysisBreakdown;
  generatedScripts: RewriteGeneratedScript[];
}

export interface RewriteFormState {
  originalCopy: string;
  userBackground: string;
  industry: string;
  needs: string;
  refineInstruction: string;
}

export interface RewriteHistoryItem {
  id: string;
  createdAt: string;
  originalCopy: string;
  userBackground: string;
  industry: string;
  needs: string;
  result: RewriteCopyResult;
}
