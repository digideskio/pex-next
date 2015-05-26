define([
  "hem/HEMesh",
  "hem/HEVertex",
  "hem/HEEdge",
  "hem/HEFace",
  "pex/core/Vec3"
  ],
  function(HEMesh, HEVertex, HEEdge, HEFace, Vec3) {
    
  function Extrude() {
  }
  
  HEMesh.prototype.extrude = function(height) {
    var numFaces = this.faces.length;

    var self = this;
    this.getSelectedFaces().forEach(function(face, i) {
      var normal = face.getNormal();
      var edge = face.edge;
      var lastEdge = edge.findPrev();
      var edgeToSplit = edge;
      var prevNewEdge = null;
      var center = face.getCenter();
      var newEdges = [];

      //we split all the corners within the face effectively adding new internal vertices
      do {
        var newVertexPos = edgeToSplit.vert.added(normal.scaled(height));
        edgeToSplit.vert.edge = edgeToSplit; //TODO: fix that, making sure we split the right face
        var newEdge = self.splitVertex(edgeToSplit.vert, newVertexPos);
        newEdges.push(newEdge);
        if (edgeToSplit == lastEdge) {
          break;
        }
        edgeToSplit = edgeToSplit.next;
      } while(edgeToSplit != edge);

      //go through all new corners and cut out faces from them
      var prevCornerEdge = newEdges[newEdges.length-1].next;
      for(var i=0; i<newEdges.length; i++) {
        //we remember what's the next edge pointing to a new corner as
        //this might change when we add new face
        var tmp = newEdges[i].next;
        var newFace = self.splitFace(newEdges[i].next, prevCornerEdge);
        prevCornerEdge = tmp;
      }
      
    });
    
    return this;
  }

  return Extrude;
});
