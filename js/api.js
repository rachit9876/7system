import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword, deleteUser, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getDatabase, ref, get, set, remove, update } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBScBYkM47ejngCyCY_ON1icPQi56R3UH8",
    authDomain: "map-mind-aa04a.firebaseapp.com",
    databaseURL: "https://map-mind-aa04a-default-rtdb.firebaseio.com",
    projectId: "map-mind-aa04a",
    storageBucket: "map-mind-aa04a.firebasestorage.app",
    messagingSenderId: "533160260931",
    appId: "1:533160260931:web:ec8d66049f43940b90ebf6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

window.firebaseAuth = auth;

const firebaseUtils = {
    loginRegister: async (email, password) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, message: 'Logged in successfully' };
        } catch (error) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                try {
                    await createUserWithEmailAndPassword(auth, email, password);
                    return { success: true, message: 'Registered and logged in successfully' };
                } catch (regError) {
                    return { success: false, message: regError.message };
                }
            }
            return { success: false, message: error.message };
        }
    },
    
    getMindMapsList: async (username, password) => {
        // username/password are kept for API compatibility; access is always
        // scoped to the currently authenticated Firebase user (uid).
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        try {
            const snapshot = await get(ref(db, `mindmaps/${auth.currentUser.uid}`));
            const data = snapshot.val();
            if (data) {
                const mindmaps = Object.keys(data).map(key => ({
                    key,
                    name: data[key].name || key,
                    timestamp: data[key].timestamp || 0,
                    isPublic: data[key].isPublic || false
                })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                return { success: true, mindmaps };
            }
            return { success: true, mindmaps: [] };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    loadMindMap: async (username, password, mindmapName, mindmapKey = mindmapName) => {
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        try {
            // Use the database key (which may differ from the display name).
            const snapshot = await get(ref(db, `mindmaps/${auth.currentUser.uid}/${mindmapKey}`));
            const data = snapshot.val();
            if (data) return { success: true, data: data.data };
            return { success: false, message: 'Mind map not found' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    loadPublicMindMap: async (pubUserId, pubMapName) => {
        try {
            const safeKey = pubUserId.includes('@') ? pubUserId.replace(/\./g, ',') : pubUserId;
            const snapshot = await get(ref(db, `public_mindmaps/${safeKey}/${pubMapName}`));
            const data = snapshot.val();
            if (data && data.isPublic) {
                return { success: true, data: data.data };
            }
            return { success: false, message: 'Mind map not found or not public.' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    deleteMindMap: async (email, password, mindmapName, mindmapKey = mindmapName) => {
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        try {
            await remove(ref(db, `mindmaps/${auth.currentUser.uid}/${mindmapKey}`));
            await remove(ref(db, `public_mindmaps/${auth.currentUser.uid}/${mindmapKey}`));
            return { success: true, message: 'Deleted successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    renameMindMap: async (email, password, oldName, newName) => {
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        if (/[.$#\[\]\/]/.test(newName)) {
            return { success: false, message: 'Name contains invalid characters (. $ # [ ] /)' };
        }
        try {
            const oldRef = ref(db, `mindmaps/${auth.currentUser.uid}/${oldName}`);
            const snapshot = await get(oldRef);
            const data = snapshot.val();
            if (!data) return { success: false, message: 'Mind map not found' };
            
            data.name = newName;
            data.timestamp = new Date().toISOString();
            
            await set(ref(db, `mindmaps/${auth.currentUser.uid}/${newName}`), data);
            await remove(oldRef);

            if (data.isPublic) {
                await set(ref(db, `public_mindmaps/${auth.currentUser.uid}/${newName}`), data);
                await remove(ref(db, `public_mindmaps/${auth.currentUser.uid}/${oldName}`));
            }

            return { success: true, message: 'Renamed successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    changePassword: async (email, password, oldPassword, newPassword) => {
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        try {
            const credential = EmailAuthProvider.credential(email, oldPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);
            await updatePassword(auth.currentUser, newPassword);
            return { success: true, message: 'Password changed successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    deleteAccount: async (email, password) => {
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        try {
            const credential = EmailAuthProvider.credential(email, password);
            await reauthenticateWithCredential(auth.currentUser, credential);
            
            const uid = auth.currentUser.uid;
            await remove(ref(db, `mindmaps/${uid}`));
            await remove(ref(db, `public_mindmaps/${uid}`));
            await deleteUser(auth.currentUser);
            return { success: true, message: 'Account deleted' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    exportMindMaps: async (username, password) => {
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        try {
            const snapshot = await get(ref(db, `mindmaps/${auth.currentUser.uid}`));
            return { success: true, mindmaps: snapshot.val() || {} };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    saveMindMap: async (email, password, mindmapName, data) => {
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        try {
            // First fetch existing to check isPublic flag
            const existingRef = ref(db, `mindmaps/${auth.currentUser.uid}/${mindmapName}`);
            const snapshot = await get(existingRef);
            const existingData = snapshot.val() || {};
            const isPublic = existingData.isPublic || false;

            const payload = {
                name: mindmapName,
                data: data,
                timestamp: new Date().toISOString(),
                isPublic: isPublic
            };
            
            await set(existingRef, payload);
            
            if (isPublic) {
                await set(ref(db, `public_mindmaps/${auth.currentUser.uid}/${mindmapName}`), payload);
            }
            
            return { success: true, message: 'Saved successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    togglePublicMindMap: async (email, password, mindmapName, isPublic) => {
        if (!auth.currentUser) return { success: false, message: 'Not authenticated' };
        try {
            await update(ref(db, `mindmaps/${auth.currentUser.uid}/${mindmapName}`), { isPublic });
            
            if (isPublic) {
                const snapshot = await get(ref(db, `mindmaps/${auth.currentUser.uid}/${mindmapName}`));
                await set(ref(db, `public_mindmaps/${auth.currentUser.uid}/${mindmapName}`), snapshot.val());
            } else {
                await remove(ref(db, `public_mindmaps/${auth.currentUser.uid}/${mindmapName}`));
            }
            return { success: true, message: `Mind map is now ${isPublic ? 'public' : 'private'}` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
};

window.firebaseUtils = firebaseUtils;

window.escapeHtml = (unsafe) => {
    return (unsafe || '').replace(/[&<"'>]/g, function (match) {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return match;
        }
    });
};
