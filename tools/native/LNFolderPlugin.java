package com.fezzy.limitlessnotepad;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Limitless Notepad folder access (plugin name "LNFolder").
 * Lets the user pick ANY folder with the system folder picker (Storage Access Framework):
 * Documents, Downloads, an SD card, a Termux shared folder, a cloud provider folder.
 * The grant is persisted, so the folder stays available after a restart.
 *
 * pick()                       -> { uri, name }           opens the system picker
 * check({uri})                 -> { ok }                  true while the persisted grant is still held
 * list({uri})                  -> { files: [{path,dir,mtime,size}] }  recursive, dotfiles skipped
 * stat({uri,path})             -> { exists, mtime, size }
 * read({uri,path})             -> { data }                base64
 * write({uri,path,data})       -> {}                      base64 in; creates missing folders
 * mkdir({uri,path})            -> {}
 * remove({uri,path})           -> {}                      file or folder (recursive)
 * Paths are relative to the picked folder, with "/" separators.
 */
@CapacitorPlugin(name = "LNFolder")
public class LNFolderPlugin extends Plugin {

    private static final int MAX_DEPTH = 40;
    private static final int WALK_THREADS = 6;
    private static final String DIR_MIME = DocumentsContract.Document.MIME_TYPE_DIR;
    private static final String[] COLS = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        DocumentsContract.Document.COLUMN_SIZE
    };

    private ContentResolver cr() { return getContext().getContentResolver(); }

    // ---------- picker ----------

    @PluginMethod
    public void pick(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        try {
            startActivityForResult(call, i, "pickResult");
        } catch (Exception e) {
            call.reject("This device has no folder picker: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result == null ? null : result.getData();
        if (result == null || result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri tree = data.getData();
        try {
            cr().takePersistableUriPermission(tree,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) {
            call.reject("Could not keep access to that folder: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("uri", tree.toString());
        r.put("name", rootName(tree));
        call.resolve(r);
    }

    @PluginMethod
    public void check(PluginCall call) {
        String uri = call.getString("uri", "");
        boolean ok = false;
        List<UriPermission> perms = cr().getPersistedUriPermissions();
        for (UriPermission p : perms) {
            if (p.getUri().toString().equals(uri) && p.isReadPermission() && p.isWritePermission()) { ok = true; break; }
        }
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }

    // ---------- helpers ----------

    private Uri tree(PluginCall call) {
        String s = call.getString("uri");
        if (s == null || s.isEmpty()) return null;
        return Uri.parse(s);
    }

    private String rootName(Uri tree) {
        String id = DocumentsContract.getTreeDocumentId(tree);
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, id);
        Cursor c = null;
        try {
            c = cr().query(doc, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
        } catch (Exception ignored) {
            // fall through to the id
        } finally {
            if (c != null) c.close();
        }
        int k = id.lastIndexOf(':');
        String tail = k >= 0 ? id.substring(k + 1) : id;
        return tail.isEmpty() ? "Storage" : tail;
    }

    private static class Child {
        String id; String name; boolean dir; long mtime; long size;
    }

    private Child[] children(Uri tree, String parentId) {
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        Cursor c = null;
        java.util.ArrayList<Child> out = new java.util.ArrayList<>();
        try {
            c = cr().query(kids, COLS, null, null, null);
            if (c == null) return new Child[0];
            while (c.moveToNext()) {
                Child ch = new Child();
                ch.id = c.getString(0);
                ch.name = c.getString(1);
                ch.dir = DIR_MIME.equals(c.getString(2));
                ch.mtime = c.isNull(3) ? 0 : c.getLong(3);
                ch.size = c.isNull(4) ? 0 : c.getLong(4);
                if (ch.name != null) out.add(ch);
            }
        } finally {
            if (c != null) c.close();
        }
        return out.toArray(new Child[0]);
    }

    private Child find(Uri tree, String parentId, String name) {
        for (Child ch : children(tree, parentId)) {
            if (ch.name.equals(name)) return ch;
        }
        return null;
    }

    private String[] parts(String path) {
        if (path == null || path.isEmpty()) return new String[0];
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        for (String s : path.split("/")) {
            if (s.isEmpty() || s.equals(".")) continue;
            if (s.equals("..")) throw new IllegalArgumentException("Parent-folder paths are not allowed");
            out.add(s);
        }
        return out.toArray(new String[0]);
    }

    /** Document id of the folder (or file) at path, or null when missing. Creates folders when create is true. */
    private String resolveDir(Uri tree, String path, boolean create) throws Exception {
        String id = DocumentsContract.getTreeDocumentId(tree);
        for (String seg : parts(path)) {
            Child ch = find(tree, id, seg);
            if (ch == null) {
                if (!create) return null;
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, id);
                Uri made = DocumentsContract.createDocument(cr(), parent, DIR_MIME, seg);
                if (made == null) throw new Exception("Could not create folder " + seg);
                id = DocumentsContract.getDocumentId(made);
            } else {
                if (!ch.dir) throw new Exception("\"" + seg + "\" is a file");
                id = ch.id;
            }
        }
        return id;
    }

    private Child resolveFile(Uri tree, String path) throws Exception {
        String[] p = parts(path);
        if (p.length == 0) return null;
        StringBuilder dir = new StringBuilder();
        for (int i = 0; i < p.length - 1; i++) { if (i > 0) dir.append('/'); dir.append(p[i]); }
        String parentId = resolveDir(tree, dir.toString(), false);
        if (parentId == null) return null;
        return find(tree, parentId, p[p.length - 1]);
    }

    /** V0.7.20: names that are app/OS noise. Every other dotfile is now listed (before, ALL dotfiles were dropped). */
    static boolean noise(String name) {
        if (name == null || name.isEmpty()) return true;
        if (name.charAt(0) != '.') return false;
        String n = name.toLowerCase();
        return n.equals(".git") || n.equals(".trash") || n.startsWith(".trash-") || n.equals(".thumbnails")
            || n.equals(".nomedia") || n.equals(".obsidian") || n.equals(".ds_store") || n.equals(".stfolder")
            || n.equals(".sync") || n.startsWith(".syncthing") || n.endsWith(".tmp") || n.endsWith(".crdownload");
    }

    private static class Dir {
        String id; String path; int depth;
        Dir(String id, String path, int depth) { this.id = id; this.path = path; this.depth = depth; }
    }

    /** V0.7.20: breadth first, one level at a time, every folder of a level listed in parallel. */
    private void walkParallel(final Uri tree, String rootId, JSArray out) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(WALK_THREADS);
        try {
            List<Dir> level = new ArrayList<>();
            level.add(new Dir(rootId, "", 0));
            while (!level.isEmpty()) {
                List<Future<List<Object[]>>> jobs = new ArrayList<>();
                for (final Dir d : level) {
                    jobs.add(pool.submit(new Callable<List<Object[]>>() {
                        @Override public List<Object[]> call() {
                            List<Object[]> rows = new ArrayList<>();
                            for (Child ch : children(tree, d.id)) {
                                if (noise(ch.name)) continue;
                                String path = d.path.isEmpty() ? ch.name : d.path + "/" + ch.name;
                                rows.add(new Object[] { ch, path, d.depth });
                            }
                            return rows;
                        }
                    }));
                }
                List<Dir> next = new ArrayList<>();
                for (Future<List<Object[]>> f : jobs) {
                    for (Object[] row : f.get()) {
                        Child ch = (Child) row[0];
                        String path = (String) row[1];
                        int depth = (Integer) row[2];
                        JSObject o = new JSObject();
                        o.put("path", path);
                        o.put("dir", ch.dir);
                        o.put("mtime", ch.dir ? 0 : ch.mtime);
                        o.put("size", ch.dir ? 0 : ch.size);
                        out.put(o);
                        if (ch.dir && depth + 1 <= MAX_DEPTH) next.add(new Dir(ch.id, path, depth + 1));
                    }
                }
                level = next;
            }
        } finally {
            pool.shutdownNow();
        }
    }

    // ---------- operations ----------

    @PluginMethod
    public void list(PluginCall call) {
        Uri tree = tree(call);
        if (tree == null) { call.reject("No folder chosen"); return; }
        try {
            JSArray files = new JSArray();
            walkParallel(tree, DocumentsContract.getTreeDocumentId(tree), files);
            JSObject r = new JSObject();
            r.put("files", files);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not list the folder: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stat(PluginCall call) {
        Uri tree = tree(call);
        if (tree == null) { call.reject("No folder chosen"); return; }
        try {
            Child ch = resolveFile(tree, call.getString("path", ""));
            JSObject r = new JSObject();
            r.put("exists", ch != null);
            r.put("mtime", ch == null ? 0 : ch.mtime);
            r.put("size", ch == null ? 0 : ch.size);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        Uri tree = tree(call);
        if (tree == null) { call.reject("No folder chosen"); return; }
        InputStream in = null;
        try {
            Child ch = resolveFile(tree, call.getString("path", ""));
            if (ch == null || ch.dir) { call.reject("File not found"); return; }
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, ch.id);
            in = cr().openInputStream(doc);
            if (in == null) { call.reject("Could not open the file"); return; }
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[65536];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage());
        } finally {
            if (in != null) { try { in.close(); } catch (Exception ignored) { /* nothing to do */ } }
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        Uri tree = tree(call);
        if (tree == null) { call.reject("No folder chosen"); return; }
        String path = call.getString("path", "");
        String data = call.getString("data", "");
        String[] p = parts(path);
        if (p.length == 0) { call.reject("No file name"); return; }
        OutputStream out = null;
        try {
            StringBuilder dir = new StringBuilder();
            for (int i = 0; i < p.length - 1; i++) { if (i > 0) dir.append('/'); dir.append(p[i]); }
            String parentId = resolveDir(tree, dir.toString(), true);
            String name = p[p.length - 1];
            Child ch = find(tree, parentId, name);
            Uri doc;
            if (ch == null) {
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, parentId);
                // octet-stream keeps providers from adding an extension to the name
                doc = DocumentsContract.createDocument(cr(), parent, "application/octet-stream", name);
                if (doc == null) { call.reject("Could not create " + name); return; }
                Child made = find(tree, parentId, name);
                if (made == null) {
                    // provider renamed it: put the real name back
                    Uri fixed = DocumentsContract.renameDocument(cr(), doc, name);
                    if (fixed != null) doc = fixed;
                }
            } else {
                if (ch.dir) { call.reject("\"" + name + "\" is a folder"); return; }
                doc = DocumentsContract.buildDocumentUriUsingTree(tree, ch.id);
            }
            out = cr().openOutputStream(doc, "wt");
            if (out == null) { call.reject("Could not open the file for writing"); return; }
            out.write(Base64.decode(data, Base64.DEFAULT));
            out.flush();
            call.resolve();
        } catch (Exception e) {
            call.reject("Write failed: " + e.getMessage());
        } finally {
            if (out != null) { try { out.close(); } catch (Exception ignored) { /* nothing to do */ } }
        }
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        Uri tree = tree(call);
        if (tree == null) { call.reject("No folder chosen"); return; }
        try {
            resolveDir(tree, call.getString("path", ""), true);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not create the folder: " + e.getMessage());
        }
    }

    /** Delete a tree child-first. Several DocumentsProvider implementations refuse to
     * delete a non-empty directory, so a single deleteDocument() is not portable. */
    private void deleteRecursively(Uri tree, Child child) throws Exception {
        if (child.dir) {
            for (Child nested : children(tree, child.id)) {
                deleteRecursively(tree, nested);
            }
        }
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, child.id);
        if (!DocumentsContract.deleteDocument(cr(), doc)) {
            throw new Exception("Provider refused to delete " + child.name);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        Uri tree = tree(call);
        if (tree == null) { call.reject("No folder chosen"); return; }
        try {
            String path = call.getString("path", "");
            String[] p = parts(path);
            if (p.length == 0) { call.reject("Refusing to delete the chosen folder itself"); return; }
            Child ch = resolveFile(tree, path);
            if (ch == null) { call.resolve(); return; }
            deleteRecursively(tree, ch);
            call.resolve();
        } catch (Exception e) {
            call.reject("Delete failed: " + e.getMessage());
        }
    }
}
