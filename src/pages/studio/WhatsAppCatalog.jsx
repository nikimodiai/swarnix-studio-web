import React, { useState } from 'react';
import { BookImage, Plus, X, Share2, Download, Images } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { buildCatalogPdf, hasWatermarkedItems } from '../../lib/catalogPdf';
import StudioLibraryPicker from '../../components/StudioLibraryPicker';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './WhatsAppCatalog.module.css';

const MAX_ITEMS = 24;

/**
 * WhatsApp Catalog export — pick generated images from the Library, add a
 * name + price to each, and export a single branded PDF page (a 2-column
 * grid, each image at its own natural aspect ratio so nothing is ever
 * cropped or padded) ready to forward on WhatsApp. Entirely client-side: no
 * credits, no new backend — reuses StudioLibraryPicker's multi-select and
 * app_gallery.
 */
export default function WhatsAppCatalog({ onBack }) {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState([]); // { url, name, price }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [perPage, setPerPage] = useState(6);   // A4 products per page: 6 or 9

  const branding = {
    storeName: profile?.store_name ?? null,
    storePhone: profile?.store_phone ?? null,
    storeLogoUrl: profile?.store_logo_url ?? null,
  };

  const addFromLibrary = (urls, rows = []) => {
    setPickerOpen(false);
    const existing = new Set(items.map((i) => i.url));
    const fresh = urls.filter((u) => !existing.has(u)).slice(0, MAX_ITEMS - items.length);
    const byUrl = new Map(rows.map((r) => [r.image_url, r]));
    setItems((prev) => [...prev, ...fresh.map((url) => {
      const row = byUrl.get(url);
      // Carry the library id + grade so the PDF can swap in the clean image
      // for anything the account has since unlocked.
      return { url, name: '', price: '', id: row?.id, credit_grade: row?.credit_grade };
    })]);
  };

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const buildAndAct = async (action) => {
    if (items.length === 0 || exporting) return;
    setExporting(true);
    try {
      const { blob: pdfBlob, bytes, overCap } = await buildCatalogPdf(items, branding, { perPage });
      if (overCap) {
        showToast(
          `Catalog is ${(bytes / 1024 / 1024).toFixed(1)} MB — larger than we'd like for WhatsApp. Try fewer items per catalog.`,
          '#1D4ED8'
        );
      }
      const file = new File([pdfBlob], 'catalog.pdf', { type: 'application/pdf' });

      if (action === 'share' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Catalog' });
        return;
      }
      if (action === 'share') {
        showToast('Sharing a PDF isn’t supported here — downloading instead.', '#1D4ED8');
      }
      // Download the blob we already built directly — no re-fetch round trip
      // (the earlier version routed through downloadMedia()'s fetch-a-blob-URL
      // helper, which is meant for remote media URLs, not a blob we already
      // hold in memory).
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'catalog.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      if (e?.name !== 'AbortError') showToast('Could not build the catalog.', '#be123c');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={BookImage}
        title="WhatsApp catalog"
        sub="Arrange your generated photos into a priced catalog, ready to forward on WhatsApp — free, no credits."
      />

      <div className={styles.toolbar}>
        <button className={styles.addBtn} onClick={() => setPickerOpen(true)} disabled={items.length >= MAX_ITEMS}>
          <Plus size={15} /> Add from Library
        </button>
        <span className={styles.count}>{items.length} item{items.length === 1 ? '' : 's'} · up to {MAX_ITEMS}</span>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <Images size={30} strokeWidth={1.4} />
          <p>Pick a few generated photos to start building your catalog.</p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {items.map((it, idx) => (
              <div key={it.url} className={styles.item}>
                <div className={styles.thumb}>
                  <img src={it.url} alt="" />
                  <button className={styles.removeBtn} onClick={() => removeItem(idx)}><X size={13} /></button>
                </div>
                <div className={styles.itemFields}>
                  <input
                    placeholder="Item name"
                    value={it.name}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                    maxLength={30}
                  />
                  <input
                    placeholder="Price (₹)"
                    value={it.price}
                    onChange={(e) => updateItem(idx, { price: e.target.value.replace(/[^0-9,]/g, '') })}
                    maxLength={12}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <span className={styles.freeNote}>Free · doesn't use any credits</span>
          </div>

          <div className={styles.pageOpts}>
            <span className={styles.pageOptsLabel}>Products per page</span>
            <div className={styles.segmented}>
              {[6, 9].map((n) => (
                <button
                  key={n}
                  className={`${styles.segBtn} ${perPage === n ? styles.segBtnOn : ''}`}
                  onClick={() => setPerPage(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className={styles.pageOptsHint}>
              A4 portrait · {Math.ceil(items.length / perPage)} page{Math.ceil(items.length / perPage) === 1 ? '' : 's'}
            </span>
          </div>

          {hasWatermarkedItems(items) && (
            <p className={styles.wmNote}>
              Some of these were made with free credits, so they'll carry the Swarnix watermark
              in the PDF. Buy any credit pack and they'll export clean.
            </p>
          )}
          <div className={styles.actions} style={{ marginTop: 10 }}>
            <button className={styles.shareBtn} onClick={() => buildAndAct('share')} disabled={exporting}>
              <Share2 size={16} /> {exporting ? 'Building…' : 'Share catalog'}
            </button>
            <button className={styles.secondaryBtn} onClick={() => buildAndAct('download')} disabled={exporting}>
              <Download size={15} /> Download PDF
            </button>
          </div>
        </>
      )}

      {pickerOpen && (
        <StudioLibraryPicker
          onClose={() => setPickerOpen(false)}
          multi
          addLabel="Catalog"
          onPickMany={addFromLibrary}
        />
      )}
    </div>
  );
}
