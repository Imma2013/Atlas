declare module '@huggingface/transformers' {
  export type FeatureExtractionPipeline = any;
  export function pipeline(...args: any[]): Promise<any>;
}
