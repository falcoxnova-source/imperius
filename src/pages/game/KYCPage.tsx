import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, Upload, RefreshCw, CheckCircle2, Clock3, XCircle, IdCard, Camera, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../lib/i18n';

type KycStatus = 'none' | 'pending' | 'approved' | 'rejected';
type DocType = 'passport' | 'national_id' | 'drivers_license' | 'other';

interface KycRow {
  id: string;
  user_id: string;
  full_name: string;
  document_type: DocType;
  document_number: string;
  country_code: string | null;
  date_of_birth: string | null;
  document_photo_path: string;
  selfie_photo_path: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

const DOC_TYPE_VALUES: DocType[] = ['national_id', 'passport', 'drivers_license', 'other'];

const MAX_FILE_MB = 8;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

// Re-encode as a real JPEG (iPhone may send HEIC labelled as image/jpeg, which browsers can't display).
async function toJpeg(file: File, maxSide = 2000): Promise<File> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
      if (!blob) return file;
      return new File([blob], 'kyc.jpg', { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}

export function KYCPage() {
  const { t } = useI18n();
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [row, setRow] = useState<KycRow | null>(null);

  const [fullName, setFullName] = useState('');
  const [docType, setDocType] = useState<DocType>('national_id');
  const [docNumber, setDocNumber] = useState('');
  const [country, setCountry] = useState('');
  const [dob, setDob] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [docPreview, setDocPreview] = useState<string>('');
  const [selfiePreview, setSelfiePreview] = useState<string>('');

  const docInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  const status: KycStatus = (row?.status as KycStatus) || 'none';
  const canSubmit = status === 'none' || status === 'rejected';

  const showError = (text: string) => setMessage({ type: 'error', text });
  const showSuccess = (text: string) => setMessage({ type: 'success', text });

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kyc_verifications')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      setRow((data as KycRow) || null);
      if (data) {
        setFullName((data as KycRow).full_name || '');
        setDocType((data as KycRow).document_type || 'national_id');
        setDocNumber((data as KycRow).document_number || '');
        setCountry((data as KycRow).country_code || '');
        setDob((data as KycRow).date_of_birth || '');
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : t.kyc.msgLoadError);
    } finally {
      setLoading(false);
    }
  }, [profile, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (docPreview) URL.revokeObjectURL(docPreview);
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
  }, [docPreview, selfiePreview]);

  const pickFile = (kind: 'doc' | 'selfie', file: File | null) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return showError(t.kyc.msgInvalidFormat);
    if (file.size > MAX_FILE_MB * 1024 * 1024) return showError(t.kyc.msgFileTooLarge.replace('{mb}', String(MAX_FILE_MB)));
    const url = URL.createObjectURL(file);
    if (kind === 'doc') {
      if (docPreview) URL.revokeObjectURL(docPreview);
      setDocFile(file); setDocPreview(url);
    } else {
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
      setSelfieFile(file); setSelfiePreview(url);
    }
  };

  const extOf = (f: File) => (f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (fullName.trim().length < 3) return showError(t.kyc.msgEnterName);
    if (docNumber.trim().length < 3) return showError(t.kyc.msgEnterDocNumber);
    if (!docFile) return showError(t.kyc.msgUploadDoc);
    if (!selfieFile) return showError(t.kyc.msgUploadSelfie);

    setSaving(true);
    setMessage(null);
    try {
      const ts = Date.now();
      const docUp = await toJpeg(docFile);
      const selfieUp = await toJpeg(selfieFile);
      const docKey = `${profile.id}/document_${ts}.${extOf(docUp)}`;
      const selfieKey = `${profile.id}/selfie_${ts}.${extOf(selfieUp)}`;

      const up1 = await supabase.storage.from('kyc-documents').upload(docKey, docUp, {
        cacheControl: '3600', upsert: true, contentType: docUp.type,
      });
      if (up1.error) throw up1.error;

      const up2 = await supabase.storage.from('kyc-documents').upload(selfieKey, selfieUp, {
        cacheControl: '3600', upsert: true, contentType: selfieUp.type,
      });
      if (up2.error) throw up2.error;

      const { error } = await supabase.rpc('kyc_submit', {
        p_full_name: fullName.trim(),
        p_document_type: docType,
        p_document_number: docNumber.trim(),
        p_document_photo_path: docKey,
        p_selfie_photo_path: selfieKey,
        p_country_code: country.trim() ? country.trim().toUpperCase() : null,
        p_date_of_birth: dob || null,
      });
      if (error) throw error;

      showSuccess(t.kyc.msgSubmitted);
      setDocFile(null); setSelfieFile(null);
      setDocPreview(''); setSelfiePreview('');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : t.kyc.msgSubmitError);
    } finally {
      setSaving(false);
    }
  };

  const statusBanner = useMemo(() => {
    if (status === 'approved') {
      return (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
          <div>
            <p className="text-emerald-300 font-semibold">{t.kyc.statusApprovedTitle}</p>
            <p className="text-sm text-gray-300">{t.kyc.statusApprovedDesc}</p>
          </div>
        </div>
      );
    }
    if (status === 'pending') {
      return (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <Clock3 className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <p className="text-amber-300 font-semibold">{t.kyc.statusPendingTitle}</p>
            <p className="text-sm text-gray-300">{t.kyc.statusPendingDesc}</p>
          </div>
        </div>
      );
    }
    if (status === 'rejected') {
      return (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3">
          <XCircle className="w-6 h-6 text-red-400 shrink-0" />
          <div>
            <p className="text-red-300 font-semibold">{t.kyc.statusRejectedTitle}</p>
            <p className="text-sm text-gray-300">{t.kyc.statusRejectedReason} {row?.admin_notes || t.kyc.statusRejectedNotSpecified}</p>
            <p className="text-sm text-gray-400 mt-1">{t.kyc.statusRejectedNote}</p>
          </div>
        </div>
      );
    }
    return null;
  }, [status, row, t]);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-orbitron text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-cyber-blue" />
            {t.kyc.title}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {t.kyc.subtitle}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading || saving}
          className="px-4 py-2 rounded-lg border border-cyber-blue/40 text-cyber-blue hover:bg-cyber-blue/10 disabled:opacity-50 flex items-center gap-2 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t.kyc.refresh}
        </button>
      </div>

      {message && (
        <div className={`rounded-lg border p-3 text-sm ${message.type === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {statusBanner}

      {canSubmit && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
            <AlertTriangle className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-300">
              {t.kyc.formIntro1}<strong>{t.kyc.formIntroDoc}</strong>{t.kyc.formIntro2}
              <strong>{t.kyc.formIntroSelfie}</strong>{t.kyc.formIntro3}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">{t.kyc.fullName}</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.kyc.fullNamePlaceholder}
                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white focus:border-cyber-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">{t.kyc.docType}</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white focus:border-cyber-blue outline-none"
              >
                {DOC_TYPE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {v === 'national_id' ? t.kyc.docTypeNationalId
                      : v === 'passport' ? t.kyc.docTypePassport
                      : v === 'drivers_license' ? t.kyc.docTypeLicense
                      : t.kyc.docTypeOther}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">{t.kyc.docNumber}</label>
              <input
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                placeholder={t.kyc.docNumberPlaceholder}
                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white focus:border-cyber-blue outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">{t.kyc.country}</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  maxLength={3}
                  placeholder={t.kyc.countryPlaceholder}
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white focus:border-cyber-blue outline-none uppercase"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">{t.kyc.dob}</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white focus:border-cyber-blue outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UploadTile
              title={t.kyc.docPhotoTitle}
              hint={t.kyc.docPhotoHint}
              icon={<IdCard className="w-6 h-6" />}
              preview={docPreview}
              changeLabel={t.kyc.uploadChange}
              formats={t.kyc.uploadFormats}
              onPick={() => docInputRef.current?.click()}
            />
            <input ref={docInputRef} type="file" accept={ACCEPTED.join(',')} className="hidden"
              onChange={(e) => pickFile('doc', e.target.files?.[0] || null)} />

            <UploadTile
              title={t.kyc.selfieTitle}
              hint={t.kyc.selfieHint}
              icon={<Camera className="w-6 h-6" />}
              preview={selfiePreview}
              changeLabel={t.kyc.uploadChange}
              formats={t.kyc.uploadFormats}
              onPick={() => selfieInputRef.current?.click()}
            />
            <input ref={selfieInputRef} type="file" accept={ACCEPTED.join(',')} className="hidden"
              onChange={(e) => pickFile('selfie', e.target.files?.[0] || null)} />
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-semibold text-gray-200 mb-2">{t.kyc.tipsTitle}</p>
            <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
              <li>{t.kyc.tip1}</li>
              <li>{t.kyc.tip2}</li>
              <li>{t.kyc.tip3}</li>
              <li>{t.kyc.tip4}</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full md:w-auto px-6 py-2.5 rounded-lg bg-cyber-blue/20 border border-cyber-blue/50 text-cyber-blue hover:bg-cyber-blue/30 disabled:opacity-50 flex items-center justify-center gap-2 font-semibold"
          >
            <Upload className="w-4 h-4" />
            {saving ? t.kyc.submitting : (status === 'rejected' ? t.kyc.resubmit : t.kyc.submit)}
          </button>
        </form>
      )}
    </div>
  );
}

function UploadTile({ title, hint, icon, preview, changeLabel, formats, onPick }: {
  title: string; hint: string; icon: React.ReactNode; preview: string; changeLabel: string; formats: string; onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group relative rounded-xl border border-dashed border-white/20 bg-black/30 hover:border-cyber-blue/60 transition-colors p-4 min-h-[160px] flex flex-col items-center justify-center gap-2 text-center overflow-hidden"
    >
      {preview ? (
        <>
          <img src={preview} alt={title} className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90" />
          <span className="relative z-10 px-2 py-1 rounded bg-black/70 text-xs text-white">{title} — {changeLabel}</span>
        </>
      ) : (
        <>
          <span className="text-cyber-blue">{icon}</span>
          <span className="text-sm text-white font-medium">{title}</span>
          <span className="text-xs text-gray-400">{hint}</span>
          <span className="text-[11px] text-gray-500 mt-1">{formats}</span>
        </>
      )}
    </button>
  );
}
