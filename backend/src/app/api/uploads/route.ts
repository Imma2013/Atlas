import { NextResponse } from 'next/server';
import ModelRegistry from '@/lib/models/registry';
import UploadManager from '@/lib/uploads/manager';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const files = formData.getAll('files') as File[];
    if (!files.length) {
      return NextResponse.json({ message: 'No files were uploaded' }, { status: 400 });
    }

    const embeddingModel = (formData.get('embedding_model_key') as string | null)?.trim() || '';
    const embeddingModelProvider =
      (formData.get('embedding_model_provider_id') as string | null)?.trim() || '';

    const registry = new ModelRegistry();

    const pickFallbackEmbedding = async () => {
      const providers = await registry.getActiveProviders();
      const provider = providers.find((item) => item.embeddingModels.length > 0);
      if (!provider) {
        throw new Error('No embedding model provider is configured. Add one in Settings > Models.');
      }
      const model = provider.embeddingModels[0];
      return { providerId: provider.id, modelKey: model.key };
    };

    const requested =
      embeddingModel && embeddingModelProvider
        ? { providerId: embeddingModelProvider, modelKey: embeddingModel }
        : await pickFallbackEmbedding();

    let model;
    try {
      model = await registry.loadEmbeddingModel(requested.providerId, requested.modelKey);
    } catch {
      const fallback = await pickFallbackEmbedding();
      model = await registry.loadEmbeddingModel(fallback.providerId, fallback.modelKey);
    }
    
    const uploadManager = new UploadManager({
      embeddingModel: model,
    })

    const processedFiles = await uploadManager.processFiles(files);

    return NextResponse.json({
      files: processedFiles,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An error has occurred.' },
      { status: 500 },
    );
  }
}
