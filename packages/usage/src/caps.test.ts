import { describe, it, expect } from 'vitest';

import { checkUploadAllowed, type Usage } from './compute';
import { PLAN_LIMITS } from '@postpilot/types';

/**
 * This is the only gate standing between a plan and unbounded storage cost, so
 * the cases that matter are the ones where it could silently let something
 * through: an upload that fits today but not once its own bytes are counted,
 * and a photo that should never consume the video allowance.
 */

const GB = 1024 ** 3;

function usage(over: Partial<Usage> = {}): Usage {
  return {
    storageBytes: 0,
    videoBytes: 0,
    imageBytes: 0,
    videoCount: 0,
    videosWithSource: 0,
    videosProcessed: 0,
    imageCount: 0,
    bytesPerVideo: null,
    ...over,
  };
}

describe('checkUploadAllowed', () => {
  it('allows an upload with room to spare', () => {
    const r = checkUploadAllowed(usage({ storageBytes: 1 * GB, videoCount: 5 }), 'FREE', {
      bytes: 1 * GB,
      addsVideo: true,
    });

    expect(r.ok).toBe(true);
    expect(r.message).toBeNull();
  });

  it("counts the incoming file's own bytes", () => {
    // 4 GB used against a 5 GB cap: fine now, over once this 2 GB lands.
    const r = checkUploadAllowed(usage({ storageBytes: 4 * GB, videoCount: 1 }), 'FREE', {
      bytes: 2 * GB,
      addsVideo: true,
    });

    expect(r.ok).toBe(false);
    expect(r.reason).toBe('storage');
  });

  it('allows an upload that lands exactly on the cap', () => {
    const r = checkUploadAllowed(usage({ storageBytes: 4 * GB }), 'FREE', {
      bytes: 1 * GB,
      addsVideo: false,
    });

    expect(r.ok).toBe(true);
  });

  it('counts the incoming video against the video cap', () => {
    // Exactly at the Free video cap: the next one must not fit.
    const r = checkUploadAllowed(usage({ videoCount: PLAN_LIMITS.FREE.videos }), 'FREE', {
      bytes: 1024,
      addsVideo: true,
    });

    expect(r.ok).toBe(false);
    expect(r.reason).toBe('videos');
  });

  it('lets a photo through when the video cap is full', () => {
    // Photos cost storage, not video slots — a full library shouldn't block one.
    const r = checkUploadAllowed(usage({ videoCount: PLAN_LIMITS.FREE.videos }), 'FREE', {
      bytes: 1024,
      addsVideo: false,
    });

    expect(r.ok).toBe(true);
  });

  it('still blocks a photo that would break the storage cap', () => {
    const r = checkUploadAllowed(usage({ storageBytes: 5 * GB }), 'FREE', {
      bytes: 1024,
      addsVideo: false,
    });

    expect(r.ok).toBe(false);
    expect(r.reason).toBe('storage');
  });

  it('reports the video cap first when both are broken', () => {
    // Both are over; the video count is the more actionable message.
    const r = checkUploadAllowed(usage({ storageBytes: 99 * GB, videoCount: 9999 }), 'FREE', {
      bytes: 1 * GB,
      addsVideo: true,
    });

    expect(r.reason).toBe('videos');
  });

  it('applies the caps of the plan it is given', () => {
    const heavy = usage({ storageBytes: 50 * GB, videoCount: 200 });

    expect(checkUploadAllowed(heavy, 'FREE', { bytes: 1 * GB, addsVideo: true }).ok).toBe(false);
    expect(checkUploadAllowed(heavy, 'CREATOR', { bytes: 1 * GB, addsVideo: true }).ok).toBe(true);
    expect(checkUploadAllowed(heavy, 'PRO', { bytes: 1 * GB, addsVideo: true }).ok).toBe(true);
  });

  it('names the plan and both numbers in the message', () => {
    const r = checkUploadAllowed(usage({ storageBytes: 5 * GB }), 'FREE', {
      bytes: 1 * GB,
      addsVideo: false,
    });

    // The message is shown as-is, so it has to say what is full and how full.
    expect(r.message).toContain('Free');
    expect(r.message).toContain('5 GB');
  });

  it('blocks an over-cap account from adding more', () => {
    // A lapsed Pro account downgraded to Free is far over its new caps. It must
    // not be able to upload, but nothing it owns is touched.
    const r = checkUploadAllowed(usage({ storageBytes: 189 * GB, videoCount: 1093 }), 'FREE', {
      bytes: 1024,
      addsVideo: true,
    });

    expect(r.ok).toBe(false);
  });
});
