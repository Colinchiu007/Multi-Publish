export = AiWriter;
declare function AiWriter(opts: any): void;
declare class AiWriter {
    constructor(opts: any);
    apiKey: any;
    apiUrl: any;
    model: any;
    isConfigured(): boolean;
    _call(systemPrompt: any, userPrompt: any): Promise<any>;
    generateTitles(topic: any, count: any): Promise<any[]>;
    generateSummary(content: any): Promise<any>;
    enhanceContent(content: any, style: any): Promise<any>;
    _parseNumberedList(text: any): any[];
}
