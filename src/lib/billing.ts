import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

export const PRO_ENTITLEMENT_ID = 'pro';
export const PRO_CACHE_KEY = '@polargrid_pro_cached';
export const PRO_FALLBACK_PRICE = '$19.99';

/** Everything PolarGrid Pro unlocks; the free tier is fully functional for "now, here". */
export const PRO_FEATURES = [
  'Plan future dates — dark-site weekends weeks or months ahead',
  'Full deep-sky catalog with ranked shoot windows',
  'Custom RA/Dec target entry',
  'Focal length filtering',
  'Saved GPS locations (backyard, dark sites, parks)',
  'Interactive altitude & meridian flip inspector',
  'Polar scope time scrubbing (±6 h)',
];

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

let configured = false;

export const isBillingAvailable = () => configured;

const hasPro = (info: CustomerInfo) => info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;

/** Cached entitlement so an unlocked device never re-locks offline at a remote site. */
export async function loadCachedPro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PRO_CACHE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function cachePro(isPro: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PRO_CACHE_KEY, isPro ? 'true' : 'false');
  } catch {
    // Storage failures are non-fatal; the next successful sync re-caches.
  }
}

/**
 * Configure RevenueCat (when an API key is present) and report entitlement
 * changes. Network failures leave the cached value untouched.
 */
export async function initBilling(onProChange: (isPro: boolean) => void): Promise<void> {
  if (!API_KEY || configured) return;
  try {
    Purchases.configure({ apiKey: API_KEY });
    configured = true;
    Purchases.addCustomerInfoUpdateListener((info) => {
      const pro = hasPro(info);
      void cachePro(pro);
      onProChange(pro);
    });
    const info = await Purchases.getCustomerInfo();
    const pro = hasPro(info);
    await cachePro(pro);
    onProChange(pro);
  } catch {
    // Offline or store unavailable: keep the cached entitlement.
  }
}

async function lifetimePackage(): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  return current?.lifetime ?? current?.availablePackages[0] ?? null;
}

export async function getProPrice(): Promise<string> {
  if (!configured) return PRO_FALLBACK_PRICE;
  try {
    return (await lifetimePackage())?.product.priceString ?? PRO_FALLBACK_PRICE;
  } catch {
    return PRO_FALLBACK_PRICE;
  }
}

export type PurchaseOutcome = 'unlocked' | 'cancelled' | 'unavailable' | 'failed';

export async function purchasePro(): Promise<PurchaseOutcome> {
  if (!configured) return 'unavailable';
  try {
    const pkg = await lifetimePackage();
    if (!pkg) return 'unavailable';
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const pro = hasPro(customerInfo);
    await cachePro(pro);
    return pro ? 'unlocked' : 'failed';
  } catch (e) {
    return (e as { userCancelled?: boolean }).userCancelled ? 'cancelled' : 'failed';
  }
}

export async function restorePro(): Promise<PurchaseOutcome> {
  if (!configured) return 'unavailable';
  try {
    const pro = hasPro(await Purchases.restorePurchases());
    await cachePro(pro);
    return pro ? 'unlocked' : 'failed';
  } catch {
    return 'failed';
  }
}
