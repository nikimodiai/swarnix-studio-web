import React, { useRef, useState } from 'react';
import { Store, Image as ImageIcon, UploadCloud, X, Check } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { saveStoreBranding, uploadStoreLogo } from '../../lib/storeBranding';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './StoreBranding.module.css';

/**
 * Shop name, phone, logo and UPI ID — set once, reused across every share
 * feature (Daily Gold Rate poster, festival posters, WhatsApp catalog).
 * Saved directly to app_profiles (client-writable under the
 * profiles_update_own_safe RLS policy — no credits or edge function needed).
 */
export default function StoreBranding({ onBack }) {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef(null);

  const [storeName, setStoreName] = useState(profile?.store_name ?? '');
  const [storePhone, setStorePhone] = useState(profile?.store_phone ?? '');
  const [upiId, setUpiId] = useState(profile?.upi_id ?? '');
  const [logoUrl, setLogoUrl] = useState(profile?.store_logo_url ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty =
    storeName.trim() !== (profile?.store_name ?? '').trim() ||
    storePhone.trim() !== (profile?.store_phone ?? '').trim() ||
    upiId.trim() !== (profile?.upi_id ?? '').trim() ||
    (logoUrl ?? null) !== (profile?.store_logo_url ?? null);

  const pickLogo = () => fileRef.current?.click();

  const onLogoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    try {
      setLogoUrl(await uploadStoreLogo(file));
    } catch (err) {
      showToast(err.message || 'Could not upload that logo.', '#be123c');
    } finally {
      setUploadingLogo(false);
    }
  };

  const save = async () => {
    if (!profile?.id || saving) return;
    setSaving(true);
    try {
      await saveStoreBranding(profile.id, { storeName, storePhone, storeLogoUrl: logoUrl, upiId });
      await refreshProfile();
      showToast('Branding saved', '#166534');
    } catch {
      showToast("Couldn't save — please try again.", '#be123c');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={Store}
        title="Store branding"
        sub="Added to your rate posters, festival posters and shared images."
      />

      <div className={styles.card}>
        <div className={styles.logoRow}>
          <button className={styles.logoPicker} onClick={pickLogo} disabled={uploadingLogo}>
            {uploadingLogo ? <div className="spinner spinner-sm" /> : logoUrl ? (
              <img src={logoUrl} alt="" className={styles.logoImg} />
            ) : <ImageIcon size={22} />}
          </button>
          <div className={styles.logoMeta}>
            <button className={styles.logoBtn} onClick={pickLogo} disabled={uploadingLogo}>
              <UploadCloud size={14} /> {logoUrl ? 'Change logo' : 'Upload logo'}
            </button>
            {logoUrl && (
              <button className={`${styles.logoBtn} ${styles.muted}`} onClick={() => setLogoUrl(null)}>
                <X size={14} /> Remove
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogoChosen} />
        </div>

        <div className={styles.field}>
          <label>Shop name</label>
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. Rani Jewellers" maxLength={40} />
        </div>
        <div className={styles.field}>
          <label>Phone / WhatsApp</label>
          <input value={storePhone} onChange={(e) => setStorePhone(e.target.value)} placeholder="Optional" maxLength={20} />
        </div>
        <div className={styles.field}>
          <label>UPI ID</label>
          <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. shop@okaxis" maxLength={60} autoCapitalize="none" />
        </div>

        <button className={styles.saveBtn} onClick={save} disabled={!dirty || saving}>
          {saving ? <div className="spinner spinner-sm" /> : <Check size={16} />}
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </div>
  );
}
