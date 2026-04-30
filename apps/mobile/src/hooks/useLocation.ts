import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { Linking, Alert } from 'react-native';

export interface LocationState {
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  permissionGranted: boolean;
}

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    lat: null,
    lng: null,
    locationName: null,
    accuracy: null,
    loading: false,
    error: null,
    permissionGranted: false,
  });

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { status: existing } = await Location.getForegroundPermissionsAsync();
    if (existing === 'granted') {
      setState((prev) => ({ ...prev, permissionGranted: true }));
      return true;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setState((prev) => ({ ...prev, permissionGranted: true }));
      return true;
    }
    // 権限が拒否された場合、設定画面へ誘導
    Alert.alert(
      '位置情報の権限が必要です',
      'アプリの設定から「位置情報」を「このアプリの使用中のみ許可」に変更してください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '設定を開く', onPress: () => Linking.openSettings() },
      ]
    );
    setState((prev) => ({ ...prev, permissionGranted: false }));
    return false;
  }, []);

  const fetchLocation = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const granted = await requestPermission();
      if (!granted) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: '位置情報の権限が許可されていません',
        }));
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude, accuracy } = location.coords;

      // Reverse geocoding to get location name
      let locationName: string | null = null;
      try {
        const geocode = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        if (geocode.length > 0) {
          const addr = geocode[0];
          const parts = [
            addr.region,
            addr.city,
            addr.subregion,
          ].filter(Boolean);
          locationName = parts.slice(0, 2).join(' ') || null;
        }
      } catch {
        // Geocoding failed, use coordinates
      }

      setState({
        lat: latitude,
        lng: longitude,
        locationName,
        accuracy: accuracy ?? null,
        loading: false,
        error: null,
        permissionGranted: true,
      });
    } catch (err: any) {
      const msg = err?.code === 'E_LOCATION_SERVICES_DISABLED'
        ? 'デバイスの位置情報サービスがオフです。設定からONにしてください。'
        : '位置情報の取得に失敗しました。しばらく後に再試行してください。';
      setState((prev) => ({
        ...prev,
        loading: false,
        error: msg,
      }));
    }
  }, [requestPermission]);

  useEffect(() => {
    // Check permission on mount without requesting
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        setState((prev) => ({ ...prev, permissionGranted: true }));
        fetchLocation();
      }
    });
  }, [fetchLocation]);

  return {
    ...state,
    fetchLocation,
    requestPermission,
  };
}
