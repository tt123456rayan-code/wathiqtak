import { analyzeGovernmentLetter, generateOfficialReply, type LetterAnalysis } from "./analysisEngine";

export interface AiProvider {
  analyzeGovernmentLetter(text: string): Promise<LetterAnalysis>;
  generateOfficialReply(analysis: LetterAnalysis): Promise<string>;
}

export const localRulesProvider: AiProvider = {
  async analyzeGovernmentLetter(text) {
    return analyzeGovernmentLetter(text);
  },
  async generateOfficialReply(analysis) {
    return generateOfficialReply(analysis);
  },
};

export const externalAiProvider: AiProvider | null = null;
