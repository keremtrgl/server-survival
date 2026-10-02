// Shared GPU resources for request tokens.
//
// Every live request used to allocate its own SphereGeometry and
// MeshBasicMaterial, so a busy board created and disposed hundreds of GPU
// buffers and shader programs per second. All request spheres are the same
// shape and only ever show one of a handful of colours (one per traffic type,
// plus the fail and throttle flashes), so they share a single geometry and one
// material per colour instead.
//
// Ownership: this module owns these resources for the lifetime of the page.
// Request.destroy() and run teardown must NOT dispose them — they only detach
// the mesh from the scene. A colour change is a material SWAP, never a
// `material.color.setHex()` mutation, because the material is shared by every
// request of that colour.

let sharedGeometry = null;
const materialsByColor = new Map();

export function getRequestGeometry() {
    if (!sharedGeometry) sharedGeometry = new THREE.SphereGeometry(0.4, 8, 8);
    return sharedGeometry;
}

export function getRequestMaterial(color) {
    let mat = materialsByColor.get(color);
    if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color });
        materialsByColor.set(color, mat);
    }
    return mat;
}

// Recolour a request token without touching any other request.
export function setRequestColor(req, color) {
    if (req?.mesh) req.mesh.material = getRequestMaterial(color);
}

export function isSharedRequestResource(resource) {
    if (!resource) return false;
    if (resource === sharedGeometry) return true;
    for (const mat of materialsByColor.values()) if (mat === resource) return true;
    return false;
}
