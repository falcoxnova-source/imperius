// Pagina de configuracion - Settings page for Falco-X Universo
// Includes: Profile settings, avatar upload, vacation mode, notifications, and account deletion
import { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, User, Bell, Shield, Palette, Save, CheckCircle, Trash2, Camera, Upload, X, AlertTriangle, Clock, EyeOff, Bot } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';
import { resolveAvatarUrl, toStoragePath } from '../../lib/avatar';
import type { VacationStatus, VacationToggleResult } from '../../types/game';

// Avatar configuration constants
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 150 * 1024; // 150KB max after resize
const AVATAR_SIZE = 84; // 84x84 pixels

/**
 * Resizes an image file to the specified dimensions using Canvas API
 * Returns a Blob with the resized image in JPEG format for optimal compression
 */
const resizeImage = (file: File, maxSize: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // Set canvas to target size
      canvas.width = maxSize;
      canvas.height = maxSize;

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Calculate crop dimensions to center the image (square crop)
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      // Draw image centered and scaled to fit
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, maxSize, maxSize);

      // Convert to blob with JPEG compression for smaller file size
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.85 // Quality 85% for good balance of size and quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

export function SettingsPage() {
  const { t, language } = useI18n();
  const { profile, updateProfile, signOut, refreshProfile } = useAuthStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [username, setUsername] = useState(profile?.username || '');
  const [notifyAttacks, setNotifyAttacks] = useState(profile?.notify_attacks ?? true);
  const [notifyBuildings, setNotifyBuildings] = useState(profile?.notify_buildings ?? true);
  const [notifyResearch, setNotifyResearch] = useState(profile?.notify_research ?? true);
  const [notifyMessages, setNotifyMessages] = useState(profile?.notify_messages ?? true);
  const [hideRecords, setHideRecords] = useState(profile?.hide_records ?? false);
  const [telegramAlerts, setTelegramAlerts] = useState(profile?.telegram_alerts_enabled ?? true);
  const [telegramAlertsLoading, setTelegramAlertsLoading] = useState(false);

  // Two-factor login (email code) state
  const [twoFactorLogin, setTwoFactorLogin] = useState(profile?.two_factor_login_enabled ?? false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState('');

  // Autopilot state
  const [autopilotActive, setAutopilotActive] = useState(profile?.autopilot_active ?? false);
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [autopilotMessage, setAutopilotMessage] = useState('');
  const [hasAndroidOfficer, setHasAndroidOfficer] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  // Vacation mode state
  const [vacationStatus, setVacationStatus] = useState<VacationStatus | null>(null);
  const [vacationLoading, setVacationLoading] = useState(false);
  const [vacationError, setVacationError] = useState('');
  const [vacationSuccess, setVacationSuccess] = useState('');

  // Fetch vacation status from server
  const fetchVacationStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_vacation_status');
      if (error) throw error;
      setVacationStatus(data as VacationStatus);
    } catch (err) {
      console.error('Error fetching vacation status:', err);
    }
  }, []);

  // Toggle vacation mode via server function
  const handleToggleVacation = async (enable: boolean) => {
    setVacationLoading(true);
    setVacationError('');
    setVacationSuccess('');

    try {
      const { data, error } = await supabase.rpc('toggle_vacation_mode', { p_enable: enable });
      if (error) throw error;

      const result = data as VacationToggleResult;

      if (result.success) {
        setVacationSuccess(enable ? t.settings.vacationModeEnableSuccess : t.settings.vacationModeDisableSuccess);
        await fetchVacationStatus();
        await refreshProfile();
        setTimeout(() => setVacationSuccess(''), 5000);
      } else {
        setVacationError(result.error || t.settings.vacationModeError);
      }
    } catch (err) {
      console.error('Error toggling vacation mode:', err);
      setVacationError(t.settings.vacationModeError);
    } finally {
      setVacationLoading(false);
    }
  };

  // Toggle autopilot via RPC
  const handleToggleAutopilot = async (enable: boolean) => {
    setAutopilotLoading(true);
    setAutopilotMessage('');
    try {
      const { data, error } = await supabase.rpc('toggle_autopilot', { p_enable: enable });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; active?: boolean };
      if (result.success) {
        setAutopilotActive(enable);
        setAutopilotMessage(enable ? t.settings.autopilotActivated : t.settings.autopilotDeactivated);
        await refreshProfile();
        setTimeout(() => setAutopilotMessage(''), 5000);
      } else {
        setAutopilotMessage(result.error || t.settings.autopilotError);
      }
    } catch (err) {
      console.error('Error toggling autopilot:', err);
      setAutopilotMessage(t.settings.autopilotError);
    } finally {
      setAutopilotLoading(false);
    }
  };

  // Toggle two-factor login (email code) via profile update
  const handleToggle2FA = async (enable: boolean) => {
    setTwoFactorLoading(true);
    setTwoFactorMessage('');
    try {
      await updateProfile({ two_factor_login_enabled: enable });
      setTwoFactorLogin(enable);
      setTwoFactorMessage(
        enable
          ? 'Verificacion en dos pasos activada. Te pediremos un codigo por correo al iniciar sesion.'
          : 'Verificacion en dos pasos desactivada.'
      );
      setTimeout(() => setTwoFactorMessage(''), 5000);
    } catch (err) {
      console.error('Error toggling 2FA:', err);
      setTwoFactorLogin(!enable);
      setTwoFactorMessage('No se pudo actualizar la verificacion en dos pasos. Intenta de nuevo.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleToggleTelegramAlerts = async (enable: boolean) => {
    setTelegramAlertsLoading(true);
    setTelegramAlerts(enable);
    try {
      await updateProfile({ telegram_alerts_enabled: enable });
    } catch (err) {
      console.error('Error toggling Telegram alerts:', err);
      setTelegramAlerts(!enable);
    } finally {
      setTelegramAlertsLoading(false);
    }
  };

  // Fetch vacation status on mount and periodically
  useEffect(() => {
    fetchVacationStatus();
    const interval = setInterval(fetchVacationStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchVacationStatus]);
  // Check if user has Android Officer active (grants autopilot access)
  // Use canonical backend RPC has_autopilot_access (admin flag OR active android officer)
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('has_autopilot_access', {
        p_user_id: profile.id,
      });
      if (cancelled) return;
      setHasAndroidOfficer(!error && data === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.autopilot_active]);

  const handleSave = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      await updateProfile({
        username,
        notify_attacks: notifyAttacks,
        notify_buildings: notifyBuildings,
        notify_research: notifyResearch,
        notify_messages: notifyMessages,
        hide_records: hideRecords,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword || !profile) return;

    setDeleteError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email || '',
        password: deletePassword,
      });

      if (signInError) {
        setDeleteError(t.settings.incorrectPassword);
        return;
      }

      const { error: deleteError } = await supabase.rpc('delete_user_account');

      if (deleteError) {
        setDeleteError(t.settings.deleteAccountError);
        console.error('Delete error:', deleteError);
        return;
      }

      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error deleting account:', error);
      setDeleteError(t.settings.deleteAccountError);
    }
  };

  /**
   * Handles avatar file selection and upload to Supabase Storage
   * - Validates file type
   * - Resizes image to 84x84 pixels for optimal performance
   * - Converts to JPEG with compression (max 150KB)
   * - Uploads to avatars/{user_id}/avatar.jpg
   * - Updates profile with new avatar URL
   */
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    setAvatarError('');

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setAvatarError(t.settings.avatarInvalidType);
      return;
    }

    setUploadingAvatar(true);

    try {
      // Resize image to 84x84 and convert to JPEG
      const resizedBlob = await resizeImage(file, AVATAR_SIZE);

      // Verify final size is under limit
      if (resizedBlob.size > MAX_FILE_SIZE) {
        setAvatarError(t.settings.avatarTooLarge);
        setUploadingAvatar(false);
        return;
      }

      // Always use .jpg extension since we convert to JPEG
      const filePath = `${profile.id}/avatar.jpg`;

      // Delete existing avatar file first to avoid conflicts
      const { error: deleteError } = await supabase.storage
        .from('avatars')
        .remove([filePath]);

      if (deleteError) {
        console.warn('Delete existing avatar warning:', deleteError);
      }

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, resizedBlob, {
          upsert: true,
          contentType: 'image/jpeg',
          cacheControl: '0'
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Guardamos SOLO la ruta relativa (+ timestamp anti-cache) para que el
      // avatar siga funcionando aunque cambie el dominio del juego.
      const avatarUrl = `${toStoragePath(urlData.publicUrl)}?t=${Date.now()}`;

      // Update profile with new avatar URL
      await updateProfile({ avatar_url: avatarUrl });
      await refreshProfile();

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setAvatarError(t.settings.avatarUploadError);
    } finally {
      setUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Removes current avatar from storage and clears profile avatar_url
   */
  const handleRemoveAvatar = async () => {
    if (!profile) return;

    setUploadingAvatar(true);
    setAvatarError('');

    try {
      // List and delete all avatar files for this user
      const { data: existingFiles } = await supabase.storage
        .from('avatars')
        .list(profile.id);

      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map(f => `${profile.id}/${f.name}`);
        await supabase.storage.from('avatars').remove(filesToDelete);
      }

      // Clear avatar URL in profile
      await updateProfile({ avatar_url: null });
      await refreshProfile();

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error removing avatar:', error);
      setAvatarError(t.settings.avatarRemoveError);
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="font-orbitron text-2xl text-white flex items-center gap-3">
          <Settings className="w-8 h-8 text-cyber-blue" />
          {t.settings.title}
        </h1>
        {saved && (
          <div className="flex items-center gap-2 text-cyber-green">
            <CheckCircle className="w-5 h-5" />
            <span>{t.settings.saved}</span>
          </div>
        )}
      </div>

      {/* Profile Section - Avatar and Basic Info */}
      <div className="card-glass p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-cyber-blue/20 rounded-lg">
            <User className="w-6 h-6 text-cyber-blue" />
          </div>
          <div>
            <h2 className="font-orbitron text-lg text-white">{t.settings.profile}</h2>
            <p className="text-sm text-gray-400">{t.settings.accountInfo}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Avatar Upload Section */}
          <div>
            <label className="block text-sm text-gray-400 mb-3">{t.settings.profilePicture}</label>
            <div className="flex items-center gap-6">
              {/* Avatar Preview */}
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-cyber-blue/30 bg-space-700 flex items-center justify-center">
                  {resolveAvatarUrl(profile?.avatar_url) ? (
                    <img
                      src={resolveAvatarUrl(profile?.avatar_url)!}
                      alt={profile?.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 text-gray-500" />
                  )}
                </div>
                {/* Upload Overlay */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  {uploadingAvatar ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>
              </div>

              {/* Upload Controls */}
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="flex items-center gap-2 px-4 py-2 bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue rounded-lg transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {t.settings.uploadPhoto}
                </button>
                {profile?.avatar_url && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="flex items-center gap-2 px-4 py-2 bg-cyber-red/20 hover:bg-cyber-red/30 text-cyber-red rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    {t.settings.removePhoto}
                  </button>
                )}
              </div>
            </div>
            {/* Avatar Error Message */}
            {avatarError && (
              <p className="text-cyber-red text-sm mt-2">{avatarError}</p>
            )}
            <p className="text-xs text-gray-500 mt-2">{t.settings.avatarHint}</p>
          </div>

          {/* Username Field */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.settings.username}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-cyber max-w-md"
              minLength={3}
              maxLength={20}
            />
          </div>

          {/* Email Field (Read-only) */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">{t.settings.email}</label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="input-cyber max-w-md opacity-50 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">{t.settings.emailCannotChange}</p>
          </div>
        </div>
      </div>

      <div className="card-glass p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className={`p-3 rounded-lg ${vacationStatus?.is_active ? 'bg-cyber-green/20' : 'bg-cyber-orange/20'}`}>
            <Shield className={`w-6 h-6 ${vacationStatus?.is_active ? 'text-cyber-green' : 'text-cyber-orange'}`} />
          </div>
          <div>
            <h2 className="font-orbitron text-lg text-white">{t.settings.vacationMode}</h2>
            <p className="text-sm text-gray-400">{t.settings.vacationModeDescription}</p>
          </div>
        </div>

        {/* Vacation Mode Status Display */}
        {vacationStatus?.is_active ? (
          <div className="space-y-4">
            {/* Active Status Banner */}
            <div className="p-4 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-cyber-green" />
                <p className="text-cyber-green font-semibold">{t.settings.vacationModeActive}</p>
              </div>
              <p className="text-sm text-gray-400">{t.settings.vacationModeInfo}</p>
            </div>

            {/* Time Remaining */}
            {vacationStatus.hours_remaining !== undefined && vacationStatus.hours_remaining > 0 && (
              <div className="p-4 bg-cyber-orange/10 border border-cyber-orange/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyber-orange" />
                  <div>
                    <p className="text-cyber-orange font-semibold">{t.settings.vacationModeCannotDisable}</p>
                    <p className="text-sm text-gray-400">
                      {t.settings.vacationModeHoursRemaining.replace('{hours}', vacationStatus.hours_remaining.toFixed(1))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Can Disable */}
            {vacationStatus.can_disable && (
              <div className="p-4 bg-space-700/50 rounded-lg">
                <p className="text-cyber-green mb-3">{t.settings.vacationModeCanDisable}</p>
                <button
                  onClick={() => handleToggleVacation(false)}
                  disabled={vacationLoading}
                  className="px-4 py-2 bg-cyber-orange/20 hover:bg-cyber-orange/30 text-cyber-orange border border-cyber-orange/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {vacationLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-cyber-orange/30 border-t-cyber-orange rounded-full animate-spin" />
                      {t.common.loading}
                    </span>
                  ) : (
                    t.settings.deactivateVacationMode
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Info about vacation mode */}
            <div className="p-4 bg-space-700/50 rounded-lg">
              <p className="text-white font-semibold mb-2">{t.settings.activateVacationMode}</p>
              <p className="text-sm text-gray-400">{t.settings.vacationModeInfo}</p>
            </div>

            {/* Warning about minimum duration */}
            <div className="p-4 bg-cyber-orange/10 border border-cyber-orange/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-cyber-orange flex-shrink-0" />
                <p className="text-cyber-orange text-sm">{t.settings.vacationModeMinimum}</p>
              </div>
            </div>

            {/* Cannot enable if incoming attacks */}
            {vacationStatus && !vacationStatus.can_enable && vacationStatus.incoming_attacks > 0 && (
              <div className="p-4 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-cyber-red flex-shrink-0" />
                  <div>
                    <p className="text-cyber-red font-semibold">{t.settings.vacationModeCannotEnable}</p>
                    <p className="text-sm text-gray-400">
                      {t.settings.vacationModeIncomingAttacks.replace('{count}', String(vacationStatus.incoming_attacks))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Enable Button */}
            <button
              onClick={() => handleToggleVacation(true)}
              disabled={vacationLoading || (vacationStatus && !vacationStatus.can_enable)}
              className="w-full px-4 py-3 bg-cyber-blue/20 hover:bg-cyber-blue/30 text-cyber-blue border border-cyber-blue/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {vacationLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-cyber-blue/30 border-t-cyber-blue rounded-full animate-spin" />
                  {t.common.loading}
                </span>
              ) : (
                t.settings.activateVacationMode
              )}
            </button>
          </div>
        )}

        {/* Success Message */}
        {vacationSuccess && (
          <div className="mt-4 p-4 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-cyber-green" />
              <p className="text-cyber-green text-sm">{vacationSuccess}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {vacationError && (
          <div className="mt-4 p-4 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-cyber-red" />
              <p className="text-cyber-red text-sm">{vacationError}</p>
            </div>
          </div>
        )}
      </div>

      <div className="card-glass p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-cyber-green/20 rounded-lg">
            <Bell className="w-6 h-6 text-cyber-green" />
          </div>
          <div>
            <h2 className="font-orbitron text-lg text-white">{t.settings.notifications}</h2>
            <p className="text-sm text-gray-400">{t.settings.notificationPreferences}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-space-700/50 rounded-lg">
            <div>
              <span className="text-white">{t.settings.telegramAlerts}</span>
              <p className="text-xs text-gray-500 mt-1">{t.settings.telegramAlertsDescription}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
              <input
                type="checkbox"
                checked={telegramAlerts}
                disabled={telegramAlertsLoading}
                onChange={(e) => handleToggleTelegramAlerts(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-green"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-3 bg-space-700/50 rounded-lg">
            <span className="text-white">{t.settings.notifyIncomingAttacks}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifyAttacks}
                onChange={(e) => setNotifyAttacks(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-green"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-3 bg-space-700/50 rounded-lg">
            <span className="text-white">{t.settings.notifyBuildingsComplete}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifyBuildings}
                onChange={(e) => setNotifyBuildings(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-green"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-3 bg-space-700/50 rounded-lg">
            <span className="text-white">{t.settings.notifyResearchComplete}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifyResearch}
                onChange={(e) => setNotifyResearch(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-green"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-3 bg-space-700/50 rounded-lg">
            <span className="text-white">{t.settings.notifyNewMessages}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifyMessages}
                onChange={(e) => setNotifyMessages(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-green"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Privacy Section */}
      <div className="card-glass p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-cyber-orange/20 rounded-lg">
            <EyeOff className="w-6 h-6 text-cyber-orange" />
          </div>
          <div>
            <h2 className="font-orbitron text-lg text-white">{t.settings.privacy}</h2>
            <p className="text-sm text-gray-400">{t.settings.privacyDescription}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-space-700/50 rounded-lg">
            <div>
              <span className="text-white">{t.settings.hideRecords}</span>
              <p className="text-xs text-gray-500 mt-1">{t.settings.hideRecordsDescription}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
              <input
                type="checkbox"
                checked={hideRecords}
                onChange={(e) => setHideRecords(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-orange"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Security Section - Two-factor login */}
      <div className="card-glass p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-cyber-blue/20 rounded-lg">
            <Shield className="w-6 h-6 text-cyber-blue" />
          </div>
          <div>
            <h2 className="font-orbitron text-lg text-white">Seguridad</h2>
            <p className="text-sm text-gray-400">Protege el acceso a tu cuenta</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-space-700/50 rounded-lg">
            <div className="pr-4">
              <span className="text-white">Verificacion en dos pasos (2FA) al iniciar sesion</span>
              <p className="text-xs text-gray-500 mt-1">
                Cuando esta activa, te enviaremos un codigo de 6 digitos por correo cada vez que inicies sesion.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={twoFactorLogin}
                onChange={(e) => handleToggle2FA(e.target.checked)}
                disabled={twoFactorLoading}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-blue"></div>
            </label>
          </div>
          {twoFactorMessage && (
            <div className="p-3 bg-cyber-blue/10 border border-cyber-blue/30 rounded-lg">
              <p className="text-cyber-blue text-sm">{twoFactorMessage}</p>
            </div>
          )}
        </div>
      </div>

      {/* Autopilot Section - Visible if admin enabled OR user has Android Officer */}
      {(profile?.autopilot_eligible || hasAndroidOfficer) && (
        <div className="card-glass p-6 border-2 border-cyber-purple/30">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-cyber-purple/20 rounded-lg">
              <Bot className="w-6 h-6 text-cyber-purple" />
            </div>
            <div>
              <h2 className="font-orbitron text-lg text-white">{t.settings.autopilot}</h2>
              <p className="text-sm text-gray-400">{t.settings.autopilotDescription}</p>
            </div>
            {autopilotActive && (
              <span className="ml-auto px-2 py-1 text-xs bg-cyber-green/20 text-cyber-green rounded-full animate-pulse">
                ACTIVO
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-space-700/50 rounded-lg">
              <div>
                <span className="text-white">{t.settings.autopilotToggle}</span>
                <p className="text-xs text-gray-500 mt-1">{t.settings.autopilotToggleDescription}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-4">
                <input
                  type="checkbox"
                  checked={autopilotActive}
                  onChange={(e) => handleToggleAutopilot(e.target.checked)}
                  disabled={autopilotLoading}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 bg-space-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-purple ${autopilotLoading ? 'opacity-50' : ''}`}></div>
              </label>
            </div>
            {autopilotMessage && (
              <div className={`p-3 rounded-lg text-sm ${autopilotActive ? 'bg-cyber-green/10 text-cyber-green' : 'bg-cyber-orange/10 text-cyber-orange'}`}>
                {autopilotMessage}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card-glass p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-cyber-pink/20 rounded-lg">
            <Palette className="w-6 h-6 text-cyber-pink" />
          </div>
          <div>
            <h2 className="font-orbitron text-lg text-white">{t.settings.statistics}</h2>
            <p className="text-sm text-gray-400">{t.settings.accountSummary}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-4 bg-space-700/50 rounded-lg text-center">
            <p className="text-sm text-gray-400">{t.settings.totalPoints}</p>
            <p className="font-orbitron text-xl text-cyber-blue">
              {profile?.points_total.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-space-700/50 rounded-lg text-center">
            <p className="text-sm text-gray-400">{t.settings.rank}</p>
            <p className="font-orbitron text-xl text-cyber-yellow">#{profile?.rank_position || '-'}</p>
          </div>
          <div className="p-4 bg-space-700/50 rounded-lg text-center">
            <p className="text-sm text-gray-400">{t.settings.memberSince}</p>
            <p className="font-orbitron text-sm text-white">
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')
                : '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="card-glass p-6 border-2 border-cyber-red/30">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-cyber-red/20 rounded-lg">
            <Trash2 className="w-6 h-6 text-cyber-red" />
          </div>
          <div>
            <h2 className="font-orbitron text-lg text-white">{t.settings.dangerZone}</h2>
            <p className="text-sm text-gray-400">{t.settings.deleteAccountPermanently}</p>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-cyber-red/20 hover:bg-cyber-red/30 text-cyber-red border border-cyber-red/50 rounded-lg transition-colors"
          >
            {t.settings.deleteAccount}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-cyber-red/10 border border-cyber-red/30 rounded-lg">
              <p className="text-cyber-red text-sm mb-3">
                {t.settings.deleteAccountWarning}
              </p>
              <p className="text-white text-sm font-semibold mb-2">
                {t.settings.enterPasswordToConfirm}
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={t.settings.password}
                className="input-cyber mb-3"
              />
              {deleteError && (
                <p className="text-cyber-red text-sm mb-3">{deleteError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={!deletePassword}
                  className="px-4 py-2 bg-cyber-red text-white rounded-lg hover:bg-cyber-red/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t.settings.confirmDelete}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword('');
                    setDeleteError('');
                  }}
                  className="px-4 py-2 bg-space-700 text-white rounded-lg hover:bg-space-600 transition-colors"
                >
                  {t.common.cancel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-cyber flex items-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t.settings.saving}
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {t.settings.saveChanges}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
