var debug = require('debug').enable('-')
var Platform = require('../../sys/Platform');
var Window = require('../../sys/Window');
var Program = require('../Program');
var Mat4 = require('../../math/Mat4');
var Mat3 = require('../../math/Mat3');
var Vec3 = require('../../math/Vec3');
var loadGLTF = require('../../utils/load-gltf');
var log = require('debug')('example/GLTF');

var logOnceCache = {};
function logOnce() {
    var msg = Array.prototype.slice.call(arguments).join(' ');
    if (!logOnceCache[msg]) {
        logOnceCache[msg] = msg;
        console.log(msg);
    }
}

var ASSETS_PATH = Platform.isBrowser ? 'assets' : __dirname + '/assets';

function forEachKeyValue(obj, cb) {
    var index = 0;
    Object.keys(obj).forEach(function(key) {
        cb(key, obj[key], index++);
    })
}

var setUniformCount = 0;
var drawCount = 0;

Window.create({
    settings: {
        width: 800 * 4,
        height: 600 * 4,
        type: '3d',
        highdpi: 2
    },
    init: function() {
        var ctx = this.getContext();

        //loadGLTF(ctx, ASSETS_PATH + '/gltf/duck/duck.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/rambler/rambler.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/wine/wine.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/SuperMurdoch/SuperMurdoch.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/Bus/WuZhouLong_Shenzhen_Bus.gltf', this.onSceneLoaded.bind(this));
        loadGLTF(ctx, ASSETS_PATH + '/gltf/DisneyCastle/DLP-castle-4-light.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/CesiumMilkTruck/CesiumMilkTruck.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/CesiumMan/Cesium_Man.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/CesiumAir/Cesium_Air.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/CesiumGround/Cesium_Ground.gltf', this.onSceneLoaded.bind(this));
        //loadGLTF(ctx, ASSETS_PATH + '/gltf/Oceanarium/steps.gltf', this.onSceneLoaded.bind(this));
        this.projectionMatrix       = Mat4.perspective(Mat4.create(), 60, this.getWidth()/this.getHeight(), 0.1, 1000);
        this.viewMatrix             = Mat4.create();
        this._tempModelViewMatrix   = Mat4.create();
        this._tempNormalMatrix4     = Mat4.create();
        this._tempNormalMatrix3     = Mat3.create();
        this._tmpVec3               = Vec3.create();
        this._flipYAxis             = false;

        this.t = 0;

        ctx.setClearColor(0.82,0.82,0.82,1.0);
        ctx.setDepthTest(true);
        ctx.setProjectionMatrix(this.projectionMatrix);
    },
    prepareUniforms: function(json, instanceProgramInfo, parameters, instanceValues) {
        //FIXME: getting gl context -> ugly!
        var ctx = this.getContext();
        var gl = ctx.getGL();

        var uniforms = {};
        forEachKeyValue(instanceProgramInfo.uniforms, function(uniformName, valueName) {
            var parameter = parameters[valueName];
            var value = instanceValues[valueName] || parameter.value;
            uniforms[uniformName] = null;
            if (!value) {
                if (parameter.source) {
                    log('uniform source found', parameter.source);
                    //TODO: are sources refering only to node matrices?
                    value = json.nodes[parameter.source].matrix;
                }
                else if (parameter.semantic) {
                    switch(parameter.semantic) {
                        case 'MODELVIEW': value = Mat4.create(); break; //TODO: handle custom variable names in the shader
                        case 'PROJECTION': value = Mat4.create(); break; //TODO: handle custom variable names in the shader
                        case 'MODELVIEWINVERSETRANSPOSE': value = Mat3.create(); break; //TODO: handle MODELVIEWINVERSETRANSPOSE matrix
                        case 'JOINTMATRIX': value = Mat4.create(); break;  //TODO: handle JOINTMATRIX matrix
                        default:
                            throw new Error('Unknown uniform semantic found ' + parameter.semantic);
                    }
                }
                else {
                  logOnce('WARN: No value for uniform:' + valueName);
                }
            }
            if (instanceValues[valueName]) {
                switch(parameters[valueName].type) {
                  case gl.SAMPLER_2D: value = json.textures[value]._texture; break; //TODO: check if this is not null (eg. texture loading failed)
                  case gl.FLOAT_VEC2: break;
                  case gl.FLOAT_VEC3: break;
                  case gl.FLOAT_VEC4: break;
                  case gl.FLOAT_MAT4: break;
                  case gl.FLOAT: break;
                  default:
                    throw new Error('Unknown uniform type:' + parameters[valueName].type);
                }
            }

            if (value === null || value === undefined) {
                logOnce('WARN: Uniform ' + valueName + ' is missing');
            }
            uniforms[uniformName] = value;
        });
        return uniforms;
    },
    onSceneLoaded: function(err, json) {
        console.log('onSceneLoaded')
        if (err) {
            console.log(err);
            console.log(err.stack);
            return;
        }
        else {
            this.prepareScene(json);
        }
    },
    prepareScene: function(json) {
        console.log('prepareScene')
        this.json = json;
        var self = this;

        this.sceneCenter = Vec3.create();
        this.sceneMaxSize = 0;

        forEachKeyValue(json.nodes, function(nodeName, nodeInfo, nodeIndex) {
            if (nodeInfo.name == 'Y_UP_Transform') {
                this._flipYAxis = (nodeInfo.matrix[9] == -1) ? true : false;
            }
        }.bind(this));
        forEachKeyValue(json.meshes, function(meshName, meshInfo, meshIndex) {
            meshInfo.primitives.forEach(function(primitiveInfo, primitiveIndex) {
                try {
                    //if (!primitiveInfo.vertexArray) return; //FIXME: TEMP!
                    var materialInfo = json.materials[primitiveInfo.material];
                    var instanceValues = materialInfo.instanceTechnique.values;
                    var techniqueInfo = json.techniques[materialInfo.instanceTechnique.technique];
                    var parameters = techniqueInfo.parameters;
                    var defaultPass = techniqueInfo.passes.defaultPass;
                    var instanceProgramInfo = defaultPass.instanceProgram;
                    var program = json.programs[instanceProgramInfo.program]._program;

                    var localModelViewMatrix = Mat4.create();

                    var uniforms = self.prepareUniforms(json, instanceProgramInfo, parameters, instanceValues)

                    primitiveInfo._renderInfo = {
                        program     : program,
                        uniforms    : uniforms,
                        offset      : primitiveInfo._indexBufferOffset,
                        count       : primitiveInfo._indexBufferCount
                    };
                    primitiveInfo._renderInfo.uniformList = [];
                    forEachKeyValue(primitiveInfo._renderInfo.uniforms, function(name, value) {
                        primitiveInfo._renderInfo.uniformList.push([name, value]);
                    });
                    primitiveInfo._renderInfo.bbox = {
                        min: Vec3.create(),
                        max: Vec3.create(),
                    }

                    var posAccessor = json.accessors[primitiveInfo.attributes.POSITION];
                    Vec3.set(primitiveInfo._renderInfo.bbox.min, posAccessor.min);
                    Vec3.set(primitiveInfo._renderInfo.bbox.max, posAccessor.max);

                    //console.log('renderInfo', primitiveInfo._renderInfo)
                }
                catch(e) {
                    console.log(e.stack)
                }
            });
        });

        console.log('prepareScene', 'done')

        //TODO: get main camera name from scene
        //FIXME: giving up on gltf camera for now
        //get first camera
        //var mainCameraName = Object.keys(json.cameras)[0];
        //var camera = json.cameras[mainCameraName];
        //var perspective = camera.perspective;
        //var yfov = perspective.yfov;
        //var znear = perspective.znear;
        //var zfar = perspective.zfar;
        //var aspectRatio = this.getAspectRatio();
        //this.projectionMatrix = Mat4.perspective(Mat4.create(), yfov, aspectRatio, znear, zfar);
        //var cameraNode = Object.keys(json.nodes).filter(function(nodeName) {
        //    var node = json.nodes[nodeName];
        //    if (node.camera == mainCameraName) {
        //        //this.viewMatrix = node.matrix;
        //    }
        //}.bind(this))
    },
    drawNodes: function(ctx, json, nodes, boundingBoxToUpdate) {
        var projectionMatrix = this.projectionMatrix;
        var viewMatrix = this.viewMatrix;
        var modelViewMatrix = this._tempModelViewMatrix;
        var normalMatrix4 = this._tempNormalMatrix4;
        var normalMatrix3 = this._tempNormalMatrix3;
        var tmpVec3 = this._tmpVec3;

        //FIXME: change to for loops
        nodes.forEach(function(node) {
            ctx.pushModelMatrix();
            if (node.matrix) {
                ctx.multMatrix(node.matrix);
            }
            if (node.rotation) {
                //TODO: implement quat rotation
                //ctx.multQuat(node.rotation);
            }
            if (node.scale) {
                //TODO: check scale transform orer
                ctx.scale(node.scale);
            }
            if (node.translation) {
                ctx.translate(node.translation)
            }
            if (node.meshes) {
                node.meshes.forEach(function(meshName) {
                    var meshInfo = json.meshes[meshName];
                    var modelMatrix = ctx.getModelMatrix();

                    Mat4.set(modelViewMatrix, viewMatrix);
                    Mat4.mult(modelViewMatrix, modelMatrix);

                    //meshInfo.primitives.forEach(function(primitiveInfo) {
                    for(var i=0; i<meshInfo.primitives.length; i++) {
                        var primitiveInfo = meshInfo.primitives[i];
                        var vao = primitiveInfo._vertexArray;
                        var offset = primitiveInfo._renderInfo.offset;
                        var count = primitiveInfo._renderInfo.count;
                        var program = primitiveInfo._renderInfo.program;
                        var uniforms = primitiveInfo._renderInfo.uniforms;
                        var uniformList = primitiveInfo._renderInfo.uniformList;
                        ctx.bindVertexArray(vao);
                        ctx.bindProgram(program);
                        var numActiveTextures = 0;
                        //forEachKeyValue(uniforms, function(name, value) {
                        for(var j=0; j<uniformList.length; j++) {
                            var name = uniformList[j][0];
                            var value = uniformList[j][1];
                            //FIXME: ugly uniform._handle texture detection
                            if (value && value._handle) {
                                ctx.bindTexture(value, numActiveTextures);
                                program.setUniform(name, numActiveTextures);
                                setUniformCount++;
                                numActiveTextures++;
                            }
                            else {
                                if (!value) {
                                    logOnce('WARN. Missing value for uniform ' + name + '');
                                    value = 1.0;
                                    return;
                                }
                                if (program._uniforms[name]) {
                                    program.setUniform(name, value);
                                    setUniformCount++;
                                }
                                else {
                                    logOnce('WARN. Mesh material has ' + name + ' but program is not using it');
                                }
                            }
                        }

                        program.setUniform('u_projectionMatrix', projectionMatrix);
                        program.setUniform('u_modelViewMatrix', modelViewMatrix);
                        Mat4.set(normalMatrix4, modelViewMatrix);
                        Mat4.invert(normalMatrix4);
                        Mat4.transpose(normalMatrix4);
                        //Mat3.fromMat4(normalMatrix3, normalMatrix4);
                        normalMatrix3[ 0] = normalMatrix4[ 0]; normalMatrix3[ 1] = normalMatrix4[ 1];  normalMatrix3[ 2] = normalMatrix4[ 2];
                        normalMatrix3[ 3] = normalMatrix4[ 4]; normalMatrix3[ 4] = normalMatrix4[ 5];  normalMatrix3[ 5] = normalMatrix4[ 6];
                        normalMatrix3[ 6] = normalMatrix4[ 8]; normalMatrix3[ 7] = normalMatrix4[ 9];  normalMatrix3[ 8] = normalMatrix4[10];
                        if (program._uniforms['u_normalMatrix'])
                            program.setUniform('u_normalMatrix', normalMatrix3);
                        setUniformCount++;
                        setUniformCount++;

                        if (boundingBoxToUpdate) {
                            Vec3.set(tmpVec3, primitiveInfo._renderInfo.bbox.min);
                            Vec3.multMat4(tmpVec3, modelMatrix);
                            boundingBoxToUpdate.min[0] = Math.min(boundingBoxToUpdate.min[0], tmpVec3[0]);
                            boundingBoxToUpdate.min[1] = Math.min(boundingBoxToUpdate.min[1], tmpVec3[1]);
                            boundingBoxToUpdate.min[2] = Math.min(boundingBoxToUpdate.min[2], tmpVec3[2]);
                            boundingBoxToUpdate.max[0] = Math.max(boundingBoxToUpdate.max[0], tmpVec3[0]);
                            boundingBoxToUpdate.max[1] = Math.max(boundingBoxToUpdate.max[1], tmpVec3[1]);
                            boundingBoxToUpdate.max[2] = Math.max(boundingBoxToUpdate.max[2], tmpVec3[2]);
                            Vec3.set(tmpVec3, primitiveInfo._renderInfo.bbox.max);
                            Vec3.multMat4(tmpVec3, modelMatrix);
                            boundingBoxToUpdate.min[0] = Math.min(boundingBoxToUpdate.min[0], tmpVec3[0]);
                            boundingBoxToUpdate.min[1] = Math.min(boundingBoxToUpdate.min[1], tmpVec3[1]);
                            boundingBoxToUpdate.min[2] = Math.min(boundingBoxToUpdate.min[2], tmpVec3[2]);
                            boundingBoxToUpdate.max[0] = Math.max(boundingBoxToUpdate.max[0], tmpVec3[0]);
                            boundingBoxToUpdate.max[1] = Math.max(boundingBoxToUpdate.max[1], tmpVec3[1]);
                            boundingBoxToUpdate.max[2] = Math.max(boundingBoxToUpdate.max[2], tmpVec3[2]);
                        }
                        else {
                            ctx.drawElements(ctx.TRIANGLES, count, offset);
                            drawCount++;
                        }
                    }
                })
            }
            this.drawNodes(ctx, json, node.children, boundingBoxToUpdate)
            ctx.popModelMatrix();
        }.bind(this))
    },
    draw: function() {
        var ctx = this.getContext();
        var time = this.t;

        ctx.clear(ctx.COLOR_BIT | ctx.DEPTH_BIT);

        if (this.json) {
            try {
                var up = this._flipYAxis ? -1 : 1;
                var dist = 0.5;
                ctx.setViewMatrix(Mat4.lookAt9(this.viewMatrix,
                        this.sceneCenter[0] + this.sceneMaxSize * dist * Math.cos(time * Math.PI),
                        this.sceneCenter[1] + 0.5 * up * this.sceneMaxSize * dist * Math.sin(time * 0.5),
                        this.sceneCenter[2] + this.sceneMaxSize * dist * Math.sin(time * Math.PI),
                        this.sceneCenter[0],
                        this.sceneCenter[1],
                        this.sceneCenter[2],
                        0,
                        up,
                        0
                    )
                )
            }
            catch(e) {
                console.log(e.stack)
            }

            var rootNodes = this.json.scenes[this.json.scene].nodes;
            var sceneBoundingBoxIsDirty = (this.sceneMaxSize == 0);
            if (sceneBoundingBoxIsDirty) {
                this.sceneBoundingBox = {
                    min: [ Infinity,  Infinity,  Infinity],
                    max: [-Infinity, -Infinity, -Infinity]
                }
            }
            try {
                var gl = ctx.getGL();
                //gl.finish();
                //console.time('drawNodes');
                //setUniformCount = 0;
                //drawCount = 0;
                this.drawNodes(ctx, this.json, rootNodes, sceneBoundingBoxIsDirty ? this.sceneBoundingBox : null);
                //console.log('draws:' + drawCount, 'uniforms:' + setUniformCount);
                //gl.flush();
                //gl.finish();
                //console.timeEnd('drawNodes');
            }
            catch(e) {
                console.log(e.stack);
                //this.draw = function() {}
            }
            if (sceneBoundingBoxIsDirty) {
                var sceneSize = Vec3.sub(Vec3.copy(this.sceneBoundingBox.max), this.sceneBoundingBox.min);
                this.sceneMaxSize = Math.max(sceneSize[0], Math.max(sceneSize[1], sceneSize[2]));
                Vec3.set(this.sceneCenter, this.sceneBoundingBox.min);
                Vec3.add(this.sceneCenter, this.sceneBoundingBox.max);
                Vec3.scale(this.sceneCenter, 0.5);
            }
        }

        this.t += 1 / 60;
    }
});
