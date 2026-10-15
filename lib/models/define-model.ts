// lib/models/define-model.ts
import mongoose, { Schema } from 'mongoose';

/**
 * Register a model once per process. In development, hot reload re-runs the
 * model file with the new schema, but mongoose would keep serving the old
 * cached model — so newly added fields get silently dropped on save until the
 * dev server restarts. Rebuilding the model on reload avoids that.
 */
export function defineModel<T>(name: string, schema: Schema<T>) {
  if (process.env.NODE_ENV !== 'production' && mongoose.models[name]) {
    mongoose.deleteModel(name);
  }
  return mongoose.models[name] || mongoose.model<T>(name, schema);
}
