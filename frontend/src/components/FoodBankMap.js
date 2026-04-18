// FoodBankMap - Mapbox embed iframe (no bundler issues, uses token)
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

export default function FoodBankMap({
  selectedFoodBank,
  onLocationChange,
}) {
  const openInGoogleMaps = (org) => {
    if (org) {
      const q = encodeURIComponent(`${org.name} ${org.address || ''} ${org.city || ''} ${org.state || ''}`);
      Linking.openURL(`https://maps.google.com/?q=${q}`);
    } else {
      Linking.openURL('https://maps.google.com/?q=food+bank+near+me');
    }
  };

  const requestLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => onLocationChange?.({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  if (Platform.OS !== 'web') {
    return <View style={styles.container} />;
  }

  // Mapbox embed: street-level tiles with the provided token
  const mapSrc = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12.html?title=false&zoomwheel=true&access_token=${MAPBOX_TOKEN}#4/39.5/-98.35`
    : 'https://www.openstreetmap.org/export/embed.html?bbox=-130.0,24.0,-65.0,50.0&layer=mapnik';

  return (
    <View style={styles.container}>
      <iframe
        src={mapSrc}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Food Banks Map"
        loading="lazy"
        allowFullScreen
      />

      {/* Controls overlay */}
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.pill} onPress={requestLocation}>
          <Ionicons name="location" size={16} color="#10B981" />
          <Text style={styles.pillText}>Find Nearest</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pill} onPress={() => openInGoogleMaps(selectedFoodBank)}>
          <Ionicons name="navigate" size={16} color="#3B82F6" />
          <Text style={styles.pillText}>Open Google Maps</Text>
        </TouchableOpacity>
      </View>

      {selectedFoodBank && (
        <TouchableOpacity style={styles.callout} onPress={() => openInGoogleMaps(selectedFoodBank)}>
          <Text style={styles.calloutName}>{selectedFoodBank.name}</Text>
          <Text style={styles.calloutAddr}>
            {selectedFoodBank.address ? `${selectedFoodBank.address}, ` : ''}
            {selectedFoodBank.city}, {selectedFoodBank.state}
          </Text>
          <Text style={styles.calloutLink}>Get Directions →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  overlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    gap: 6,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  callout: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  calloutName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  calloutAddr: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  calloutLink: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },
});
