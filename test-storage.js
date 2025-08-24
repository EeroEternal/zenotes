// Test script to demonstrate storage improvements
// Run this in the browser console to test storage features

console.log("=== Storage Configuration Test ===");

// Test 1: Check current storage settings
console.log("1. Current storage settings:");
try {
  const settings = JSON.parse(localStorage.getItem('mynotes_settings') || '{}');
  console.log("Storage settings:", settings.storage);
} catch (error) {
  console.log("No settings found, using defaults");
}

// Test 2: Check storage usage
console.log("\n2. Current storage usage:");
try {
  let totalSize = 0;
  let noteCount = 0;
  
  for (let key in localStorage) {
    if (key.startsWith('mynotes_data_')) {
      const data = localStorage.getItem(key);
      if (data) {
        totalSize += new Blob([data]).size;
        noteCount++;
      }
    }
  }
  
  console.log(`Notes: ${noteCount}`);
  console.log(`Total size: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log(`Average note size: ${noteCount > 0 ? (totalSize / noteCount / 1024).toFixed(2) : 0} KB`);
} catch (error) {
  console.error("Error calculating storage usage:", error);
}

// Test 3: Test storage capacity configuration
console.log("\n3. Testing storage capacity configuration:");
try {
  // Update storage settings to 100MB
  const currentSettings = JSON.parse(localStorage.getItem('mynotes_settings') || '{}');
  const newSettings = {
    ...currentSettings,
    storage: {
      maxCapacityMB: 100,
      enableAutoCleanup: true,
      cleanupThresholdPercent: 80,
      preferredStorageType: "localStorage",
      customStorageDirectory: "",
      enableCompression: true,
      maxNoteSizeKB: 1000,
    }
  };
  
  localStorage.setItem('mynotes_settings', JSON.stringify(newSettings));
  console.log("✓ Updated storage capacity to 100MB");
  console.log("✓ Enabled auto cleanup at 80%");
  console.log("✓ Set max note size to 1000KB");
  console.log("✓ Enabled compression");
  
} catch (error) {
  console.error("Error updating storage settings:", error);
}

// Test 4: Create a large test note to test storage limits
console.log("\n4. Creating test note to verify storage handling:");
try {
  const largeContent = "This is a test note with large content. ".repeat(1000);
  const testNote = {
    id: "test-storage-note",
    title: "Storage Test Note",
    content: [
      {
        type: "paragraph",
        children: [{ text: largeContent }]
      }
    ],
    tags: ["test", "storage"],
    category: "test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const noteData = JSON.stringify(testNote);
  const noteSize = new Blob([noteData]).size;
  
  console.log(`Test note size: ${(noteSize / 1024).toFixed(2)} KB`);
  
  // Try to save the note
  localStorage.setItem('mynotes_data_test-storage-note', noteData);
  console.log("✓ Successfully saved large test note");
  
  // Update metadata
  const metadata = JSON.parse(localStorage.getItem('mynotes_metadata') || '[]');
  metadata.push({
    id: testNote.id,
    title: testNote.title,
    createdAt: testNote.createdAt,
    updatedAt: testNote.updatedAt,
    tags: testNote.tags,
    category: testNote.category,
    excerpt: largeContent.substring(0, 100) + "..."
  });
  localStorage.setItem('mynotes_metadata', JSON.stringify(metadata));
  console.log("✓ Updated metadata");
  
} catch (error) {
  console.error("Error creating test note:", error);
  if (error.name === 'QuotaExceededError') {
    console.log("⚠ Storage quota exceeded - this is expected behavior");
  }
}

console.log("\n=== Test Complete ===");
console.log("Refresh the page to see the updated storage settings in action!");
console.log("Check the Settings > Storage tab to see the new configuration options.");
