import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, Modal, Alert, FlatList } from 'react-native';
import { CameraView, Camera, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Linking } from 'react-native';

const HISTORY_KEY = '@scanner_history';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [flashMode, setFlashMode] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);

  
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const storedHistory = await AsyncStorage.getItem(HISTORY_KEY);
      if (storedHistory !== null) {
        setScanHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  };

  const saveScanToHistory = async (newItem) => {
    try {
      const currentHistory = scanHistory || [];
      const updatedHistory = [newItem, ...currentHistory].slice(0, 50);
      setScanHistory(updatedHistory);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (e) {
      console.error("Failed to save history", e);
    }
  };

  const clearHistory = () => {
    Alert.alert("Clear History", "Are you sure you want to delete all past scans?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive",
        onPress: async () => {
          setScanHistory([]);
          await AsyncStorage.removeItem(HISTORY_KEY);
        }
      }
    ]);
  };

 
  const isUrl = (text) => {
    if (!text || typeof text !== 'string') return false;
    const lowerText = text.trim().toLowerCase();
    return lowerText.startsWith('http://') || lowerText.startsWith('https://') || lowerText.startsWith('www.');
  };

  const handleCopy = async () => {
    if (!scannedData?.data) return;
    await Clipboard.setStringAsync(scannedData.data);
    Alert.alert("Copied!", "Text saved to your clipboard.");
  };

  const handleOpenLink = async () => {
    try {
      let url = scannedData?.data;
      if (!url) return;
      
      if (url.toLowerCase().startsWith('www.')) {
        url = 'https://' + url;
      }
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Cannot Open", "This device doesn't know how to open this specific link.");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong trying to open the link.");
    }
  };

  const handleSearchWeb = async () => {
    try {
      const query = encodeURIComponent(scannedData?.data);
      const searchUrl = `https://www.google.com/search?q=${query}`;
      await Linking.openURL(searchUrl);
    } catch (error) {
      Alert.alert("Error", "Could not open the browser.");
    }
  };

  
  const handleBarcodeScanned = ({ type, data }) => {
    setIsScanning(false);
    
    const scanRecord = {
      id: Date.now().toString(),
      type: type || 'unknown',
      data: data || 'No data',
      date: new Date().toLocaleDateString() + ' at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setScannedData(scanRecord);
    saveScanToHistory(scanRecord);
    setModalVisible(true);
  };

  const pickImageFromGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "You need to allow access to your photos to use this feature.");
      return;
    }

    Alert.alert(
      "Scanning a Barcode?",
      "If scanning a standard 1D barcode, please use the cropping tool on the next screen to zoom in closely on the lines.",
      [
        {
          text: "Got it",
          onPress: async () => {
            let result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'], 
              allowsEditing: true, 
              quality: 1,
            });

            if (!result.canceled && result.assets && result.assets[0]) {
              try {
                const manipResult = await ImageManipulator.manipulateAsync(
                  result.assets[0].uri,
                  [{ resize: { width: 800 } }],
                  { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                );

                const allBarcodeTypes = ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar", "pdf417", "aztec", "datamatrix"];
                const scannedResults = await Camera.scanFromURLAsync(manipResult.uri, allBarcodeTypes);
                
                if (scannedResults && scannedResults.length > 0) {
                  handleBarcodeScanned({ 
                    type: scannedResults[0].type, 
                    data: scannedResults[0].data 
                  });
                } else {
                  Alert.alert("No Code Found", "We couldn't detect a clear code. Make sure the barcode is cropped tightly and isn't blurry.");
                }
              } catch (error) {
                Alert.alert("Error", "The native scanner failed to process this image file.");
              }
            }
          }
        }
      ]
    );
  };

  
  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Ionicons name="camera-outline" size={64} color="#00E676" style={{ marginBottom: 20 }} />
        <Text style={styles.permissionText}>We need your permission to show the camera.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  
  if (isScanning) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <CameraView 
          style={StyleSheet.absoluteFillObject} 
          facing="back"
          enableTorch={flashMode}
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar", "pdf417", "aztec", "datamatrix"],
          }}
        />
        <SafeAreaView style={styles.cameraOverlay} pointerEvents="box-none">
          <View style={styles.cameraHeader}>
            <TouchableOpacity onPress={() => setIsScanning(false)} style={styles.iconButton}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFlashMode(!flashMode)} style={styles.iconButton}>
              <Ionicons name={flashMode ? "flash" : "flash-off"} size={26} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.viewfinderContainer} pointerEvents="none">
            <View style={styles.viewfinder}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Text style={styles.scanInstruction}>Align code within the frame to scan</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Scanner<Text style={styles.titleHighlight}>Pro</Text></Text>
        <Text style={styles.subtitle}>Fast, secure, and accurate code scanning.</Text>
      </View>

      <View style={styles.cardContainer}>
        <TouchableOpacity style={styles.actionCard} onPress={() => setIsScanning(true)}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(0, 230, 118, 0.15)' }]}>
            <Ionicons name="scan-outline" size={40} color="#00E676" />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>Scan with Camera</Text>
            <Text style={styles.cardSubtitle}>Point your device at a QR or Barcode</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={pickImageFromGallery}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(64, 156, 255, 0.15)' }]}>
            <Ionicons name="image-outline" size={40} color="#409CFF" />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>Upload from Gallery</Text>
            <Text style={styles.cardSubtitle}>Scan a code from your saved photos</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={() => setHistoryVisible(true)}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(255, 171, 64, 0.15)' }]}>
            <Ionicons name="time-outline" size={40} color="#FFAB40" />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>Scan History</Text>
            <Text style={styles.cardSubtitle}>View your previously scanned codes</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      {/* --- HISTORY MODAL --- */}
      <Modal visible={historyVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Scan History</Text>
            <View style={styles.historyHeaderActions}>
              {scanHistory && scanHistory.length > 0 && (
                <TouchableOpacity onPress={clearHistory} style={{marginRight: 20}}>
                  <Ionicons name="trash-outline" size={24} color="#FF5252" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                <Ionicons name="close-circle" size={32} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          {!scanHistory || scanHistory.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Ionicons name="file-tray-outline" size={60} color="#333" />
              <Text style={styles.emptyHistoryText}>No scans yet.</Text>
            </View>
          ) : (
            <FlatList
              data={scanHistory}
              keyExtractor={(item, index) => item?.id || index.toString()}
              contentContainerStyle={{ padding: 20 }}
              renderItem={({ item }) => {
                const isItemUrl = isUrl(item?.data);
                const displayData = item?.data || 'Unknown Data';
                const displayDate = item?.date || 'Unknown Date';
                const displayType = item?.type && typeof item.type === 'string' 
                  ? item.type.toUpperCase() 
                  : 'UNKNOWN TYPE';

                return (
                  <TouchableOpacity 
                    style={styles.historyItem} 
                    onPress={() => {
                      setScannedData(item);
                      setHistoryVisible(false);
                      setTimeout(() => setModalVisible(true), 300);
                    }}
                  >
                    <View style={styles.historyItemIcon}>
                      <Ionicons name={isItemUrl ? "link" : "text"} size={20} color="#00E676" />
                    </View>
                    <View style={styles.historyItemText}>
                      <Text style={styles.historyItemData} numberOfLines={1}>{displayData}</Text>
                      <Text style={styles.historyItemDate}>{displayDate} • {displayType}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#444" />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* --- SCAN SUCCESS MODAL --- */}
      <Modal visible={modalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-circle" size={40} color="#00E676" style={{ marginRight: 10 }} />
              <Text style={styles.modalTitle}>Scan Success</Text>
            </View>
            
            <Text style={styles.modalDataType}>Type: {scannedData?.type || 'UNKNOWN'}</Text>
            <View style={styles.dataContainer}>
              <Text style={styles.modalData} selectable={true}>{scannedData?.data || 'No data'}</Text>
            </View>

            <View style={styles.buttonRow}>
              {isUrl(scannedData?.data) ? (
                <TouchableOpacity style={[styles.actionButton, styles.linkButton]} onPress={handleOpenLink}>
                  <Ionicons name="globe-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.actionButtonText}>Open Link</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#FFAB40' }]} onPress={handleSearchWeb}>
                  <Ionicons name="search-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.actionButtonText}>Search Web</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={[styles.actionButton, styles.copyButton]} onPress={handleCopy}>
                <Ionicons name="copy-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.actionButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.buttonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  permissionText: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 20, paddingHorizontal: 30 },
  header: { padding: 30, marginTop: 40, width: '100%' },
  title: { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  titleHighlight: { color: '#00E676' },
  subtitle: { fontSize: 16, color: '#888', marginTop: 8 },
  cardContainer: { paddingHorizontal: 20, gap: 16, width: '100%' },
  actionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#2A2A2A' },
  iconContainer: { width: 64, height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  cardTextContainer: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { color: '#888', fontSize: 13 },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'space-between', zIndex: 10 },
  cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, marginTop: 20 },
  iconButton: { width: 44, height: 44, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  viewfinderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewfinder: { width: 250, height: 250, position: 'relative' },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: '#00E676', borderWidth: 4 },
  topLeft: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 16 },
  topRight: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 16 },
  bottomLeft: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 16 },
  bottomRight: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 16 },
  scanInstruction: { color: '#fff', marginTop: 40, fontSize: 16, fontWeight: '500', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1E1E1E', width: '90%', borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2A' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  modalDataType: { color: '#00E676', fontSize: 14, fontWeight: '600', textTransform: 'uppercase', marginBottom: 20 },
  dataContainer: { backgroundColor: '#121212', width: '100%', padding: 20, borderRadius: 12, marginBottom: 20 },
  modalData: { color: '#fff', fontSize: 16, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 20 },
  actionButton: { flex: 1, flexDirection: 'row', paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  linkButton: { backgroundColor: '#409CFF' },
  copyButton: { backgroundColor: '#333' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  primaryButton: { backgroundColor: '#00E676', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 100, width: '100%', alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  historyContainer: { flex: 1, backgroundColor: '#121212' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  historyTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  historyHeaderActions: { flexDirection: 'row', alignItems: 'center' },
  emptyHistory: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyHistoryText: { color: '#666', fontSize: 18, marginTop: 16 },
  historyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2A2A2A' },
  historyItemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0, 230, 118, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  historyItemText: { flex: 1 },
  historyItemData: { color: '#fff', fontSize: 16, fontWeight: '500', marginBottom: 4 },
  historyItemDate: { color: '#888', fontSize: 12 },
});