import { getSupabaseClient, isSchemaMissingError } from '../lib/supabase';
import type {
  BodyMeasurementRecord,
  ProgressPhotoRecord,
  WeightLogRecord,
} from '../types/database';

const LOCAL_WEIGHT_LOGS_KEY = (userId: string) => `gympaglu_weight_logs_v1_${userId}`;

function readLocalWeightLogs(userId: string): WeightLogRecord[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_WEIGHT_LOGS_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WeightLogRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalWeightLogs(userId: string, rows: WeightLogRecord[]): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(LOCAL_WEIGHT_LOGS_KEY(userId), JSON.stringify(rows));
  } catch {
    // Ignore
  }
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Connect your Supabase project first.');
  }
  return client;
}

export async function fetchWeightLogs(userId: string): Promise<WeightLogRecord[]> {
  const local = readLocalWeightLogs(userId).sort((a, b) =>
    a.logged_date.localeCompare(b.logged_date)
  );
  const supabase = getSupabaseClient();
  if (!supabase) return local;

  const { data, error } = await supabase
    .from('weight_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_date', { ascending: true });

  if (error) {
    if (isSchemaMissingError(error)) return local;
    throw new Error(error.message);
  }
  const remote = (data ?? []) as WeightLogRecord[];
  const remoteIds = new Set(remote.map((r) => r.id));
  const merged = [
    ...remote,
    ...local.filter((l) => l.id.startsWith('loc-') && !remoteIds.has(l.id)),
  ].sort((a, b) => a.logged_date.localeCompare(b.logged_date));
  writeLocalWeightLogs(userId, merged);
  return merged;
}

export async function addWeightLog(
  userId: string,
  weightKg: number,
  loggedDate: string,
  notes = ''
): Promise<WeightLogRecord> {
  const rounded = Math.round(weightKg * 100) / 100;
  const localRow: WeightLogRecord = {
    id: `loc-w-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    user_id: userId,
    weight_kg: rounded,
    logged_date: loggedDate,
    notes: notes.trim(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('weight_logs')
      .insert({
        user_id: userId,
        weight_kg: rounded,
        logged_date: loggedDate,
        notes: notes.trim(),
      })
      .select('*')
      .single();

    if (!error && data) {
      await supabase
        .from('profiles')
        .update({ current_weight_kg: rounded })
        .eq('id', userId);

      const saved = data as WeightLogRecord;
      const existing = readLocalWeightLogs(userId);
      writeLocalWeightLogs(
        userId,
        [...existing, saved].sort((a, b) => a.logged_date.localeCompare(b.logged_date))
      );
      return saved;
    }
    if (error && !isSchemaMissingError(error)) {
      throw new Error(error.message);
    }
  }

  const existing = readLocalWeightLogs(userId);
  writeLocalWeightLogs(
    userId,
    [...existing, localRow].sort((a, b) => a.logged_date.localeCompare(b.logged_date))
  );
  return localRow;
}

export async function deleteWeightLog(userId: string, id: string): Promise<void> {
  const existing = readLocalWeightLogs(userId);
  writeLocalWeightLogs(
    userId,
    existing.filter((w) => w.id !== id)
  );

  const supabase = getSupabaseClient();
  if (!supabase || id.startsWith('loc-')) return;
  const { error } = await supabase.from('weight_logs').delete().eq('id', id).eq('user_id', userId);
  if (error && !isSchemaMissingError(error)) throw new Error(error.message);
}

export async function fetchBodyMeasurements(userId: string): Promise<BodyMeasurementRecord[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('logged_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as BodyMeasurementRecord[];
}

export async function addBodyMeasurement(
  userId: string,
  payload: Omit<BodyMeasurementRecord, 'id' | 'user_id'>
): Promise<BodyMeasurementRecord> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('body_measurements')
    .insert({ user_id: userId, ...payload })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as BodyMeasurementRecord;
}

export async function deleteBodyMeasurement(userId: string, id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .from('body_measurements')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function fetchProgressPhotos(userId: string): Promise<ProgressPhotoRecord[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('progress_photos')
    .select('*')
    .eq('user_id', userId)
    .order('taken_date', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProgressPhotoRecord[];

  const signedRows = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from('progress-photos')
        .createSignedUrl(row.storage_path, 3600);
      return {
        ...row,
        signedUrl: signed?.signedUrl,
      };
    })
  );

  return signedRows;
}

export async function uploadProgressPhoto(
  userId: string,
  file: File,
  meta: { pose_tag: 'front' | 'side' | 'back'; weight_kg: number | null; taken_date: string; notes: string }
): Promise<ProgressPhotoRecord> {
  const supabase = requireClient();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `${userId}/${fileName}`;

  const { error: uploadErr } = await supabase.storage
    .from('progress-photos')
    .upload(storagePath, file, { contentType: file.type || 'image/jpeg', upsert: false });

  if (uploadErr) throw new Error(uploadErr.message);

  const { data, error: dbErr } = await supabase
    .from('progress_photos')
    .insert({
      user_id: userId,
      storage_path: storagePath,
      pose_tag: meta.pose_tag,
      weight_kg: meta.weight_kg,
      taken_date: meta.taken_date,
      notes: meta.notes.trim(),
    })
    .select('*')
    .single();

  if (dbErr || !data) {
    // Cleanup orphaned storage object on DB failure
    await supabase.storage.from('progress-photos').remove([storagePath]);
    throw new Error(dbErr?.message ?? 'Failed to record progress photo metadata');
  }

  const { data: signed } = await supabase.storage
    .from('progress-photos')
    .createSignedUrl(storagePath, 3600);

  return {
    ...(data as ProgressPhotoRecord),
    signedUrl: signed?.signedUrl,
  };
}

export async function deleteProgressPhoto(
  userId: string,
  photo: ProgressPhotoRecord
): Promise<void> {
  const supabase = requireClient();
  await supabase.storage.from('progress-photos').remove([photo.storage_path]);
  const { error } = await supabase
    .from('progress_photos')
    .delete()
    .eq('id', photo.id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
