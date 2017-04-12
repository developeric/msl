/**
 * Copyright (c) 2012-2014 Netflix, Inc.  All rights reserved.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Service token unit tests.
 * 
 * @author Wesley Miaw <wmiaw@netflix.com>
 */
parameterize("ServiceToken", function data() {
    const MslConstants = require('../../../../../core/src/main/javascript/MslConstants.js');
    
    return [
        [ null ],
        [ MslConstants.CompressionAlgorithm.LZW ],
    ];
},
function(encoding, compressionAlgo) {
    const MslConstants = require('../../../../../core/src/main/javascript/MslConstants.js');
    const MslEncoderFormat = require('../../../../../core/src/main/javascript/io/MslEncoderFormat.js');
    const Random = require('../../../../../core/src/main/javascript/util/Random.js');
    const AsyncExecutor = require('../../../../../core/src/main/javascript/util/AsyncExecutor.js');
    const SecretKey = require('../../../../../core/src/main/javascript/crypto/SecretKey.js');
    const WebCryptoAlgorithm = require('../../../../../core/src/main/javascript/crypto/WebCryptoAlgorithm.js');
    const WebCryptoUsage = require('../../../../../core/src/main/javascript/crypto/WebCryptoUsage.js');
    const SymmetricCryptoContext = require('../../../../../core/src/main/javascript/crypto/SymmetricCryptoContext.js');
    const EntityAuthenticationScheme = require('../../../../../core/src/main/javascript/entityauth/EntityAuthenticationScheme.js');
    const ServiceToken = require('../../../../../core/src/main/javascript/tokens/ServiceToken.js');
    const MslException = require('../../../../../core/src/main/javascript/MslException.js');
    const MslError = require('../../../../../core/src/main/javascript/MslError.js');
    const MslEncodingException = require('../../../../../core/src/main/javascript/MslEncodingException.js');

    const textEncoding = require('../../../../../core/src/main/javascript/lib/textEncoding.js');

    const MockMslContext = require('../../../main/javascript/util/MockMslContext.js');
    const MslTestUtils = require('../../../main/javascript/util/MslTestUtils.js');
    const MockEmailPasswordAuthenticationFactory = require('../../../main/javascript/userauth/MockEmailPasswordAuthenticationFactory.js');
    
	/** MSL encoder format. */
	var ENCODER_FORMAT = MslEncoderFormat.JSON;
	
    /** Key token data. */
    var KEY_TOKENDATA = "tokendata";
    /** Key signature. */
    var KEY_SIGNATURE = "signature";
    
    // tokendata
    /** Key token name. */
    var KEY_NAME = "name";
    /** Key master token serial number. */
    var KEY_MASTER_TOKEN_SERIAL_NUMBER = "mtserialnumber";
    /** Key user ID token serial number. */
    var KEY_USER_ID_TOKEN_SERIAL_NUMBER = "uitserialnumber";
    /** Key encrypted. */
    var KEY_ENCRYPTED = "encrypted";
    /** Key compression algorithm. */
    var KEY_COMPRESSION_ALGORITHM = "compressionalgo";
    /** Key service data. */
    var KEY_SERVICEDATA = "servicedata";

    /** MSL context. */
    var ctx;
    /** MSL encoder factory. */
    var encoder;
   /** Random. */
    var random = new Random();
    
    /**
     * @param {MslContext} ctx MSL context.
     * @param {result: function(ICryptoContext), error: function(Error)}
     *        callback the callback will receive the new crypto context
     *        or any thrown exceptions.
     * @throws CryptoException if there is an error creating the crypto
     *         context.
     */
    function getCryptoContext(ctx, callback) {
        AsyncExecutor(callback, function() {
            var keysetId = "keysetId";
            var encryptionBytes = new Uint8Array(16);
            random.nextBytes(encryptionBytes);
            var hmacBytes = new Uint8Array(32);
            random.nextBytes(hmacBytes);
            SecretKey.import(encryptionBytes, WebCryptoAlgorithm.AES_CBC, WebCryptoUsage.ENCRYPT_DECRYPT, {
                result: function(encryptionKey) {
                    SecretKey.import(hmacBytes, WebCryptoAlgorithm.HMAC_SHA256, WebCryptoUsage.SIGN_VERIFY, {
                        result: function(hmacKey) {
                            AsyncExecutor(callback, function() {
                                var cryptoContext = new SymmetricCryptoContext(ctx, keysetId, encryptionKey, hmacKey, null);
                                return cryptoContext;
                            });
                        },
                        error: function(e) { callback.error(e); }
                    });
                },
                error: function(e) { callback.error(e); }
            });
        });
    }
    
    var NAME = "tokenName";
    var DATA = textEncoding.getBytes("We have to use some data that is compressible, otherwise service tokens will not always use the compression we request.", "utf-8");
    var MASTER_TOKEN;
    var USER_ID_TOKEN;
    var ENCRYPTED = true;
    var CRYPTO_CONTEXT;
    
    var initialized = false;
    beforeEach(function() {
    	if (!initialized) {
            runs(function() {
                MockMslContext.create(EntityAuthenticationScheme.PSK, false, {
                    result: function(c) { ctx = c; },
                    error: function(e) { expect(function() { throw e; }).not.toThrow(); }
                });
            });
            waitsFor(function() { return ctx; }, "ctx", 900);
	    	runs(function() {
	    		encoder = ctx.getMslEncoderFactory();
	    	    getCryptoContext(ctx, {
	    	        result: function(x) { CRYPTO_CONTEXT = x; },
	    	        error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	    	    });
	    		MslTestUtils.getMasterToken(ctx, 1, 1, {
	    			result: function(token) { MASTER_TOKEN = token; },
	    			error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	    		});
	    	});
	    	waitsFor(function() { return CRYPTO_CONTEXT && MASTER_TOKEN; }, "crypto context and master token", 100);
	    	runs(function() {
	    		MslTestUtils.getUserIdToken(ctx, MASTER_TOKEN, 1, MockEmailPasswordAuthenticationFactory.USER, {
	    			result: function(token) { USER_ID_TOKEN = token; },
	    			error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	    		});
	    	});
	    	waitsFor(function() { return USER_ID_TOKEN; }, "user ID token", 100);
	    	runs(function() { initialized = true; });
    	}
    });
    
    it("ctors", function() {
    	var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var encode;
        runs(function() {
	        expect(serviceToken.isDecrypted()).toBeTruthy();
	        expect(serviceToken.isDeleted()).toBeFalsy();
	        expect(serviceToken.isVerified()).toBeTruthy();
	        expect(serviceToken.isBoundTo(MASTER_TOKEN)).toBeTruthy();
	        expect(serviceToken.isBoundTo(USER_ID_TOKEN)).toBeTruthy();
	        expect(serviceToken.isMasterTokenBound()).toBeTruthy();
	        expect(serviceToken.isUserIdTokenBound()).toBeTruthy();
	        expect(serviceToken.isUnbound()).toBeFalsy();
	        expect(serviceToken.mtSerialNumber).toEqual(MASTER_TOKEN.serialNumber);
	        expect(serviceToken.uitSerialNumber).toEqual(USER_ID_TOKEN.serialNumber);
	        expect(serviceToken.name).toEqual(NAME);
	        expect(serviceToken.compressionAlgo).toEqual(compressionAlgo);
	        expect(new Uint8Array(serviceToken.data)).toEqual(DATA);
	        
	        serviceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
	        	result: function(x) { encode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return encode; }, "encode", 100);

        var moServiceToken;
        runs(function() {
	        expect(encode).not.toBeNull();
	        
	        var mo = encoder.parseObject(encode);
            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);
        
        var moEncode;
        runs(function() {
	        expect(moServiceToken.isDecrypted()).toEqual(serviceToken.isDecrypted());
	        expect(moServiceToken.isDeleted()).toEqual(serviceToken.isDeleted());
	        expect(moServiceToken.isVerified()).toEqual(serviceToken.isVerified());
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toEqual(serviceToken.isBoundTo(MASTER_TOKEN));
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toEqual(serviceToken.isBoundTo(USER_ID_TOKEN));
	        expect(moServiceToken.isMasterTokenBound()).toEqual(serviceToken.isMasterTokenBound());
	        expect(moServiceToken.isUserIdTokenBound()).toEqual(serviceToken.isUserIdTokenBound());
	        expect(moServiceToken.isUnbound()).toEqual(serviceToken.isUnbound());
	        expect(moServiceToken.mtSerialNumber).toEqual(serviceToken.mtSerialNumber);
	        expect(moServiceToken.uitSerialNumber).toEqual(serviceToken.uitSerialNumber);
	        expect(moServiceToken.name).toEqual(serviceToken.name);
	        expect(moServiceToken.compressionAlgo).toEqual(serviceToken.compressionAlgo);
	        expect(new Uint8Array(moServiceToken.data)).toEqual(new Uint8Array(serviceToken.data));
	        moServiceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
	        	result: function(x) { moEncode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return moEncode; }, "moEncode", 100);
        
        runs(function() {
	        expect(moEncode).not.toBeNull();
	        expect(moEncode).toEqual(encode);
        });
    });
    
    it("mismatched crypto contexts", function() {
        var serviceToken, joCryptoContext;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            getCryptoContext(ctx, {
                result: function(x) { joCryptoContext = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken && joCryptoContext; }, "serviceToken and joCryptoContext", 100);
        
        var encode;
        runs(function() {
        	serviceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
        		result: function(x) { encode = x; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return encode; }, "encode", 100);

        var moServiceToken;
        runs(function() {
            var mo = encoder.parseObject(encode);
            
            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, joCryptoContext, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);
        
        var moEncode;
        runs(function() {
	        expect(moServiceToken.isDecrypted()).toBeFalsy();
	        expect(serviceToken.isDeleted()).toBeFalsy();
	        expect(moServiceToken.isVerified()).toBeFalsy();
	        expect(moServiceToken.data).toBeNull();
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toEqual(serviceToken.isBoundTo(MASTER_TOKEN));
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toEqual(serviceToken.isBoundTo(USER_ID_TOKEN));
	        expect(moServiceToken.isMasterTokenBound()).toEqual(serviceToken.isMasterTokenBound());
	        expect(moServiceToken.isUserIdTokenBound()).toEqual(serviceToken.isUserIdTokenBound());
	        expect(moServiceToken.isUnbound()).toEqual(serviceToken.isUnbound());
	        expect(moServiceToken.mtSerialNumber).toEqual(serviceToken.mtSerialNumber);
	        expect(moServiceToken.uitSerialNumber).toEqual(serviceToken.uitSerialNumber);
	        expect(moServiceToken.name).toEqual(serviceToken.name);
	        expect(moServiceToken.compressionAlgo).toEqual(serviceToken.compressionAlgo);
	        moServiceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
        		result: function(x) { moEncode = x; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return moEncode; }, "moEncode", 100);
        
        runs(function() {
	        expect(moEncode).not.toBeNull();
	        expect(moEncode).toEqual(encode);
        });
    });
    
    it("mapped crypto contexts", function() {
        var serviceToken, cryptoContexts = {};
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            
            cryptoContexts[NAME] = CRYPTO_CONTEXT;
            getCryptoContext(ctx, {
                result: function(x) { cryptoContexts[NAME + "1"] = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            getCryptoContext(ctx, {
                result: function(x) { cryptoContexts[NAME + "2"] = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken && Object.keys(cryptoContexts).length == 3; }, "serviceToken and cryptoContexts", 100);
       
        var encode;
        runs(function() {
	        serviceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
	        	result: function(x) { encode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return encode; }, "encode", 100);

        var moServiceToken;
        runs(function() {
            var mo = encoder.parseObject(encode);

            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, cryptoContexts, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);
        
        var moEncode;
        runs(function() {
	        expect(moServiceToken.isDecrypted()).toEqual(serviceToken.isDecrypted());
	        expect(moServiceToken.isDeleted()).toEqual(serviceToken.isDeleted());
	        expect(moServiceToken.isVerified()).toEqual(serviceToken.isVerified());
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toEqual(serviceToken.isBoundTo(MASTER_TOKEN));
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toEqual(serviceToken.isBoundTo(USER_ID_TOKEN));
	        expect(moServiceToken.isMasterTokenBound()).toEqual(serviceToken.isMasterTokenBound());
	        expect(moServiceToken.isUserIdTokenBound()).toEqual(serviceToken.isUserIdTokenBound());
	        expect(moServiceToken.isUnbound()).toEqual(serviceToken.isUnbound());
	        expect(moServiceToken.mtSerialNumber).toEqual(serviceToken.mtSerialNumber);
	        expect(moServiceToken.uitSerialNumber).toEqual(serviceToken.uitSerialNumber);
	        expect(moServiceToken.name).toEqual(serviceToken.name);
            expect(moServiceToken.compressionAlgo).toEqual(serviceToken.compressionAlgo);
	        expect(new Uint8Array(moServiceToken.data)).toEqual(new Uint8Array(serviceToken.data));
	        moServiceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
	        	result: function(x) { moEncode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return moEncode; }, "moEncode", 100);
        
        runs(function() {
	        expect(moEncode).not.toBeNull();
	        expect(moEncode).toEqual(encode);
	    });
    });
    
    it("unmapped crypto context", function() {
        var serviceToken = undefined, cryptoContexts = {};
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            
            cryptoContexts[NAME + "0"] = CRYPTO_CONTEXT;
            getCryptoContext(ctx, {
                result: function(x) { cryptoContexts[NAME + "1"] = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            getCryptoContext(ctx, {
                result: function(x) { cryptoContexts[NAME + "2"] = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken && Object.keys(cryptoContexts).length == 3; }, "serviceToken and cryptoContexts", 100);

        var encode;
        runs(function() {
        	serviceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
        		result: function(x) { encode = x; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return encode; }, "encode", 100);

        var moServiceToken;
        runs(function() {
        	var mo = encoder.parseObject(encode);

        	ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, cryptoContexts, {
        		result: function(token) { moServiceToken = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return encode && moServiceToken; }, "json string and moServiceToken", 100);

        var moEncode;
        runs(function() {
	        expect(moServiceToken.isDecrypted()).toBeFalsy();
	        expect(moServiceToken.isDeleted()).toBeFalsy();
	        expect(moServiceToken.isVerified()).toBeFalsy();
	        expect(moServiceToken.data).toBeNull();
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toEqual(serviceToken.isBoundTo(MASTER_TOKEN));
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toEqual(serviceToken.isBoundTo(USER_ID_TOKEN));
	        expect(moServiceToken.isMasterTokenBound()).toEqual(serviceToken.isMasterTokenBound());
	        expect(moServiceToken.isUserIdTokenBound()).toEqual(serviceToken.isUserIdTokenBound());
	        expect(moServiceToken.isUnbound()).toEqual(serviceToken.isUnbound());
	        expect(moServiceToken.mtSerialNumber).toEqual(serviceToken.mtSerialNumber);
	        expect(moServiceToken.uitSerialNumber).toEqual(serviceToken.uitSerialNumber);
	        expect(moServiceToken.name).toEqual(serviceToken.name);
            expect(moServiceToken.compressionAlgo).toEqual(serviceToken.compressionAlgo);
	        moServiceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
        		result: function(x) { moEncode = x; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return moEncode; }, "moEncode", 100);
        
        runs(function() {
	        expect(moEncode).not.toBeNull();
	        expect(moEncode).toEqual(encode);
        });
    });
    
    it("master token mismatched", function() {
        var masterToken, joMasterToken;
        runs(function() {
        	MslTestUtils.getMasterToken(ctx, 1, 1, {
        		result: function(token) { masterToken = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        	MslTestUtils.getMasterToken(ctx, 1, 2, {
        		result: function(token) { joMasterToken = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        });
        waitsFor(function() { return masterToken && joMasterToken; }, "master tokens", 100);
        
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, masterToken, null, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var exception;
        runs(function() {
	        ServiceToken.parse(ctx, mo, joMasterToken, null, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.SERVICETOKEN_MASTERTOKEN_MISMATCH));
        });
    });
    
    it("master token missing", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var exception;
        runs(function() {
	        ServiceToken.parse(ctx, mo, null, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.SERVICETOKEN_MASTERTOKEN_MISMATCH));
        });
    });
    
    it("user ID token mismatched", function() {
    	var userIdToken, joUserIdToken;
    	runs(function() {
    		MslTestUtils.getUserIdToken(ctx, MASTER_TOKEN, 1, MockEmailPasswordAuthenticationFactory.USER, {
    			result: function(token) { userIdToken = token; },
    			error: function(e) { expect(function() { throw e; }).not.toThrow(); }
    		});
    		MslTestUtils.getUserIdToken(ctx, MASTER_TOKEN, 2, MockEmailPasswordAuthenticationFactory.USER, {
    			result: function(token) { joUserIdToken = token; },
    			error: function(e) { expect(function() { throw e; }).not.toThrow(); }
    		});
    	});
    	waitsFor(function() { return userIdToken && joUserIdToken; }, "user ID tokens", 100);
    	
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, userIdToken, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var exception;
        runs(function() {
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, joUserIdToken, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.SERVICETOKEN_USERIDTOKEN_MISMATCH));
        });
    });
    
    it("user ID token missing", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var exception;
        runs(function() {
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, null, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.SERVICETOKEN_USERIDTOKEN_MISMATCH));
        });
    });
    
    it("tokens mismatched", function() {
        var masterTokenA, masterTokenB;
        runs(function() {
        	MslTestUtils.getMasterToken(ctx, 1, 1, {
        		result: function(token) { masterTokenA = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        	MslTestUtils.getMasterToken(ctx, 1, 2, {
        		result: function(token) { masterTokenB = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        });
        waitsFor(function() { return masterTokenA && masterTokenB; }, "master tokens", 100);
        
        var userIdToken;
        runs(function() {
        	MslTestUtils.getUserIdToken(ctx, masterTokenB, 1, MockEmailPasswordAuthenticationFactory.USER, {
        		result: function(token) { userIdToken = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return userIdToken; }, "user ID token", 100);

    	var exception;
    	runs(function() {
    		ServiceToken.create(ctx, NAME, DATA, masterTokenA, userIdToken, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
    			result: function() {},
    			error: function(e) { exception = e; }
    		});
    	});
    	waitsFor(function() { return exception; }, "exception", 100);
    	
    	runs(function() {
    	    var f = function() { throw exception; };
    	    expect(f).toThrow(new MslInternalException());
    	});
    });
    
    it("missing tokendata", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var exception;
        runs(function() {
        	mo.remove(KEY_TOKENDATA);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("invalid tokendata", function() {
    	var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var exception;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        ++tokendata[0];
	        mo.put(KEY_TOKENDATA, tokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("missing signature", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var exception;
        runs(function() {
        	mo.remove(KEY_SIGNATURE);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("missing name", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.remove(KEY_NAME);
        	encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
        		result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("missing master token serial number", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
            var tokendata = mo.getBytes(KEY_TOKENDATA);
            var tokendataMo = encoder.parseObject(tokendata);
            tokendataMo.remove(KEY_MASTER_TOKEN_SERIAL_NUMBER);
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var moServiceToken;
        runs(function() {
            mo.put(KEY_TOKENDATA, modifiedTokendata);
            
            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);
        
        runs(function() {
	        expect(moServiceToken.mtSerialNumber).toEqual(-1);
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toBeFalsy();
        });
    });
    
    it("invalid master token serial number", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var exception;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.put(KEY_MASTER_TOKEN_SERIAL_NUMBER, "x");
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("negative master token serial number", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.put(KEY_MASTER_TOKEN_SERIAL_NUMBER, -1);
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.SERVICETOKEN_MASTERTOKEN_SERIAL_NUMBER_OUT_OF_RANGE));
        });
    });
    
    it("too large master token serial number", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.put(KEY_MASTER_TOKEN_SERIAL_NUMBER, MslConstants.MAX_LONG_VALUE + 2);
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.SERVICETOKEN_MASTERTOKEN_SERIAL_NUMBER_OUT_OF_RANGE));
        });
    });
    
    it("missing user ID token serial number", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
            var tokendata = mo.getBytes(KEY_TOKENDATA);
            var tokendataMo = encoder.parseObject(tokendata);
            tokendataMo.remove(KEY_USER_ID_TOKEN_SERIAL_NUMBER);
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var moServiceToken;
        runs(function() {
            mo.put(KEY_TOKENDATA, modifiedTokendata);
            
            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);
        
        runs(function() {
	        expect(moServiceToken.uitSerialNumber).toEqual(-1);
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toBeFalsy();
        });
    });
    
    it("invalid user ID token serial number", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.put(KEY_USER_ID_TOKEN_SERIAL_NUMBER, "x");
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("negative user ID token serial number", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.put(KEY_USER_ID_TOKEN_SERIAL_NUMBER, -1);
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);;
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.SERVICETOKEN_USERIDTOKEN_SERIAL_NUMBER_OUT_OF_RANGE));
        });
    });
    
    it("too large user ID token serial number", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.put(KEY_USER_ID_TOKEN_SERIAL_NUMBER, MslConstants.MAX_LONG_VALUE + 2);
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.SERVICETOKEN_USERIDTOKEN_SERIAL_NUMBER_OUT_OF_RANGE));
        });
    });
    
    it("missing encrypted", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.remove(KEY_ENCRYPTED);
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
        	var f = function() { throw exception; };
        	expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("invalid encrypted", function() {
    	var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.put(KEY_ENCRYPTED, "x");
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
        	var f = function() { throw exception; };
        	expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("invalid compression algorithm", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
            var tokendata = mo.getBytes(KEY_TOKENDATA);
            var tokendataMo = encoder.parseObject(tokendata);
            tokendataMo.put(KEY_COMPRESSION_ALGORITHM, "x");
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
            mo.put(KEY_TOKENDATA, modifiedTokendata);
            
            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
                result: function() {},
                error: function(e) { exception = e; }
            });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
            var f = function() { throw exception; };
            expect(f).toThrow(new MslException(MslError.UNIDENTIFIED_COMPRESSION));
        });
    });
    
    it("missing servicedata", function() {
    	var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        tokendataMo.remove(KEY_SERVICEDATA);
            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function() {},
	        	error: function(e) { exception = e; }
	        });
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
        	var f = function() { throw exception; };
        	expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("invalid servicedata", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
        	var tokendata = mo.getBytes(KEY_TOKENDATA);
        	var tokendataMo = encoder.parseObject(tokendata);
        	tokendataMo.put(KEY_SERVICEDATA, "x");

            encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
            	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
        	CRYPTO_CONTEXT.sign(modifiedTokendata, encoder, ENCODER_FORMAT, {
        		result: function(signature) {
                	mo.put(KEY_TOKENDATA, modifiedTokendata);
                	mo.put(KEY_SIGNATURE, signature);

                	ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
                		result: function() {},
                		error: function(e) { exception = e; }
                	});
        		},
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
        	var f = function() { throw exception; };
        	expect(f).toThrow(new MslEncodingException(MslError.MSL_PARSE_ERROR));
        });
    });
    
    it("empty servicedata", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, new Uint8Array(0), MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
	        expect(serviceToken.isDeleted()).toBeTruthy();
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);

        var moServiceToken;
        runs(function() {
            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);
        
        runs(function() {
	        expect(moServiceToken.isDeleted()).toBeTruthy();
	        expect(moServiceToken.data.length).toEqual(0);
        });
    });
    
    it("empty servicedata not verified", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, new Uint8Array(0), MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);

        var moServiceToken;
        runs(function() {
	        var signature = mo.getBytes(KEY_SIGNATURE);
	        ++signature[0];
	        mo.put(KEY_SIGNATURE, signature);
	        
	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	        	result: function(token) { moServiceToken = token; },
	        	error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);
        
        runs(function() {
	        expect(moServiceToken.isDeleted()).toBeTruthy();
	        expect(moServiceToken.data.length).toEqual(0);
        });
    });
    
    it("corrupt servicedata", function() {
    	var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var mo;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceToken, {
        		result: function(x) { mo = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return mo; }, "mo", 100);
        
        var modifiedTokendata;
        runs(function() {
	        // This is testing service data that is verified but corrupt.
	        var tokendata = mo.getBytes(KEY_TOKENDATA);
	        var tokendataMo = encoder.parseObject(tokendata);
	        var servicedata = tokendataMo.getBytes(KEY_SERVICEDATA);
	        ++servicedata[servicedata.length-1];
	        tokendataMo.put(KEY_SERVICEDATA, servicedata);
	        
	        encoder.encodeObject(tokendataMo, ENCODER_FORMAT, {
	        	result: function(x) { modifiedTokendata = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return modifiedTokendata; }, "modifiedTokendata", 100);
        
        var exception;
        runs(function() {
	        CRYPTO_CONTEXT.sign(modifiedTokendata, encoder, ENCODER_FORMAT, {
	        	result: function(signature) {
	    	        mo.put(KEY_TOKENDATA, modifiedTokendata);
	    	        mo.put(KEY_SIGNATURE, signature);
	    	        
	    	        ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
	    	        	result: function() {},
	    	        	error: function(e) { exception = e; }
	    	        });
	        	},
	        	error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
    	});
        waitsFor(function() { return exception; }, "exception", 100);
        
        runs(function() {
        	var f = function() { throw exception; };
        	expect(f).toThrow(new MslCryptoException(MslError.NONE));
        });
    });
    
    it("not verified", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var encode;
        runs(function() {
        	serviceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
        		result: function(x) { encode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return encode; }, "encode", 100);
        
        var moServiceToken;
        runs(function() {
	        var mo = encoder.parseObject(encode);
	        
	        var signature = mo.getBytes(KEY_SIGNATURE);
	        ++signature[0];
	        mo.put(KEY_SIGNATURE, signature);
        
            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);
        
        var moEncode;
        runs(function() {
	        expect(moServiceToken.isDecrypted()).toBeFalsy();
	        expect(moServiceToken.isDeleted()).toBeFalsy();
	        expect(moServiceToken.isVerified()).toBeFalsy();
	        expect(moServiceToken.data).toBeNull();
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toEqual(serviceToken.isBoundTo(MASTER_TOKEN));
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toEqual(serviceToken.isBoundTo(USER_ID_TOKEN));
	        expect(moServiceToken.isMasterTokenBound()).toEqual(serviceToken.isMasterTokenBound());
	        expect(moServiceToken.isUserIdTokenBound()).toEqual(serviceToken.isUserIdTokenBound());
	        expect(moServiceToken.isUnbound()).toEqual(serviceToken.isUnbound());
	        expect(moServiceToken.mtSerialNumber).toEqual(serviceToken.mtSerialNumber);
	        expect(moServiceToken.uitSerialNumber).toEqual(serviceToken.uitSerialNumber);
	        expect(moServiceToken.name).toEqual(serviceToken.name);
	        moServiceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
	        	result: function(x) { moEncode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return moEncode; }, "moEncode", 100);
        
        runs(function() {
	        expect(moEncode).not.toBeNull();
	        expect(moEncode).not.toEqual(encode);
        });
    });
    
    it("not encrypted", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, !ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var encode;
        runs(function() {
        	expect(new Uint8Array(serviceToken.data)).toEqual(DATA);
        	serviceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
        		result: function(x) { encode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return encode; }, "encode", 100);
        
        var moServiceToken;
        runs(function() {
        	var mo = encoder.parseObject(encode);

            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);

        var moEncode;
        runs(function() {
	        expect(moServiceToken.isVerified()).toBeTruthy();
	        expect(moServiceToken.isDeleted()).toBeFalsy();
	        expect(moServiceToken.isDecrypted()).toBeTruthy();
	        expect(new Uint8Array(moServiceToken.data)).toEqual(new Uint8Array(serviceToken.data));
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toEqual(serviceToken.isBoundTo(MASTER_TOKEN));
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toEqual(serviceToken.isBoundTo(USER_ID_TOKEN));
	        expect(moServiceToken.isMasterTokenBound()).toEqual(serviceToken.isMasterTokenBound());
	        expect(moServiceToken.isUserIdTokenBound()).toEqual(serviceToken.isUserIdTokenBound());
	        expect(moServiceToken.isUnbound()).toEqual(serviceToken.isUnbound());
	        expect(moServiceToken.mtSerialNumber).toEqual(serviceToken.mtSerialNumber);
	        expect(moServiceToken.uitSerialNumber).toEqual(serviceToken.uitSerialNumber);
	        expect(moServiceToken.name).toEqual(serviceToken.name);
	        moServiceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
	        	result: function(x) { moEncode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return moEncode; }, "moEncode", 100);
        
        runs(function() {
	        expect(moEncode).not.toBeNull();
	        expect(moEncode).toEqual(encode);
        });
    });
    
    it("null crypto context", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var encode;
        runs(function() {
        	serviceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
        		result: function(x) { encode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return encode; }, "encode", 100);
        
        var moServiceToken;
        runs(function() {
        	var mo = encoder.parseObject(encode);
        
            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, null, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);

        var moEncode;
        runs(function() {
	        expect(moServiceToken.isDecrypted()).toBeFalsy();
	        expect(moServiceToken.isDeleted()).toBeFalsy();
	        expect(moServiceToken.isVerified()).toBeFalsy();
	        expect(moServiceToken.data).toBeNull();
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toEqual(serviceToken.isBoundTo(MASTER_TOKEN));
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toEqual(serviceToken.isBoundTo(USER_ID_TOKEN));
	        expect(moServiceToken.isMasterTokenBound()).toEqual(serviceToken.isMasterTokenBound());
	        expect(moServiceToken.isUserIdTokenBound()).toEqual(serviceToken.isUserIdTokenBound());
	        expect(moServiceToken.isUnbound()).toEqual(serviceToken.isUnbound());
	        expect(moServiceToken.mtSerialNumber).toEqual(serviceToken.mtSerialNumber);
	        expect(moServiceToken.uitSerialNumber).toEqual(serviceToken.uitSerialNumber);
	        expect(moServiceToken.name).toEqual(serviceToken.name);
	        moServiceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
	        	result: function(x) { moEncode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return moEncode; }, "moEncode", 100);
        
        runs(function() {
	        expect(moEncode).not.toBeNull();
	        expect(moEncode).toEqual(encode);
        });
    });
    
    it("not encrypted with null crypto context", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, !ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        
        var encode;
        runs(function() {
        	serviceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
        		result: function(x) { encode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return encode; }, "encode", 100);
        
        var moServiceToken;
        runs(function() {
        	var mo = encoder.parseObject(encode);

            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, null, {
                result: function(token) { moServiceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return moServiceToken; }, "moServiceToken", 100);

        var moEncode;
        runs(function() {
	        expect(moServiceToken.isDecrypted()).toBeFalsy();
	        expect(moServiceToken.isDeleted()).toBeFalsy();
	        expect(moServiceToken.isVerified()).toBeFalsy();
	        expect(moServiceToken.data).toBeNull();
	        expect(moServiceToken.isBoundTo(MASTER_TOKEN)).toEqual(serviceToken.isBoundTo(MASTER_TOKEN));
	        expect(moServiceToken.isBoundTo(USER_ID_TOKEN)).toEqual(serviceToken.isBoundTo(USER_ID_TOKEN));
	        expect(moServiceToken.isMasterTokenBound()).toEqual(serviceToken.isMasterTokenBound());
	        expect(moServiceToken.isUserIdTokenBound()).toEqual(serviceToken.isUserIdTokenBound());
	        expect(moServiceToken.isUnbound()).toEqual(serviceToken.isUnbound());
	        expect(moServiceToken.mtSerialNumber).toEqual(serviceToken.mtSerialNumber);
	        expect(moServiceToken.uitSerialNumber).toEqual(serviceToken.uitSerialNumber);
	        expect(moServiceToken.name).toEqual(serviceToken.name);
	        moServiceToken.toMslEncoding(encoder, ENCODER_FORMAT, {
	        	result: function(x) { moEncode = x; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
	        });
        });
        waitsFor(function() { return moEncode; }, "moEncode", 100);
        
        runs(function() {
	        expect(moEncode).not.toBeNull();
	        expect(moEncode).toEqual(encode);
        });
    });
    
    it("isBoundTo(masterToken)", function() {
        var masterTokenA, masterTokenB;
        runs(function() {
        	MslTestUtils.getMasterToken(ctx, 1, 1, {
        		result: function(token) { masterTokenA = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        	MslTestUtils.getMasterToken(ctx, 1, 2, {
        		result: function(token) { masterTokenB = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        });
        waitsFor(function() { return masterTokenA && masterTokenB; }, "master tokens", 100);
        
        var serviceTokenA, serviceTokenB;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, masterTokenA, null, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenA = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            ServiceToken.create(ctx, NAME, DATA, masterTokenB, null, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenB = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceTokenA && serviceTokenB; }, "service tokens", 100);
        
        runs(function() {
	        expect(serviceTokenA.isBoundTo(masterTokenA)).toBeTruthy();
	        expect(serviceTokenA.isBoundTo(masterTokenB)).toBeFalsy();
	        expect(serviceTokenA.isBoundTo(null)).toBeFalsy();
	        expect(serviceTokenB.isBoundTo(masterTokenB)).toBeTruthy();
	        expect(serviceTokenB.isBoundTo(masterTokenA)).toBeFalsy();
	        expect(serviceTokenA.isBoundTo(null)).toBeFalsy();
        });
    });
    
    it("isBoundTo(userIdToken)", function() {
        var userIdTokenA, userIdTokenB;
        runs(function() {
        	MslTestUtils.getUserIdToken(ctx, MASTER_TOKEN, 1, MockEmailPasswordAuthenticationFactory.USER, {
        		result: function(token) { userIdTokenA = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        	MslTestUtils.getUserIdToken(ctx, MASTER_TOKEN, 2, MockEmailPasswordAuthenticationFactory.USER, {
        		result: function(token) { userIdTokenB = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        });
        waitsFor(function() { return userIdTokenA && userIdTokenB; }, "user ID tokens", 100);
        
        var serviceTokenA, serviceTokenB;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, userIdTokenA, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenA = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, userIdTokenB, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenB = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceTokenA && serviceTokenB; }, "service tokens", 100);
        
        runs(function() {
	        expect(serviceTokenA.isBoundTo(userIdTokenA)).toBeTruthy();
	        expect(serviceTokenA.isBoundTo(userIdTokenB)).toBeFalsy();
	        expect(serviceTokenA.isBoundTo(null)).toBeFalsy();
	        expect(serviceTokenB.isBoundTo(userIdTokenB)).toBeTruthy();
	        expect(serviceTokenB.isBoundTo(userIdTokenA)).toBeFalsy();
	        expect(serviceTokenA.isBoundTo(null)).toBeFalsy();
        });
    });
    
    it("isUnbound", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, null, null, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        runs(function() {
	        expect(serviceToken.isUnbound()).toBeTruthy();
	        expect(serviceToken.isBoundTo(MASTER_TOKEN)).toBeFalsy();
	        expect(serviceToken.isBoundTo(USER_ID_TOKEN)).toBeFalsy();
	        expect(serviceToken.isBoundTo(null)).toBeFalsy();
        });
    });
    
    it("equals name", function() {
        var nameA = NAME + "A";
        var nameB = NAME + "B";
        var serviceTokenA, serviceTokenB;
        runs(function() {
            ServiceToken.create(ctx, nameA, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenA = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            ServiceToken.create(ctx, nameB, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenB = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceTokenA && serviceTokenB; }, "service tokens A and B", 100);
        
        var serviceTokenA2;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceTokenA, {
        		result: function(mo) {
		            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
		                result: function(token) { serviceTokenA2 = token; },
		                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
		            });
        		},
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return serviceTokenA2; }, "service token A2", 100);

        runs(function() {
	        expect(serviceTokenA.equals(serviceTokenA)).toBeTruthy();
	        expect(serviceTokenA.uniqueKey()).toEqual(serviceTokenA.uniqueKey());
	        
	        expect(serviceTokenA.equals(serviceTokenB)).toBeFalsy();
	        expect(serviceTokenB.equals(serviceTokenA)).toBeFalsy();
	        expect(serviceTokenB.uniqueKey()).not.toEqual(serviceTokenA.uniqueKey());
	        
	        expect(serviceTokenA.equals(serviceTokenA2)).toBeTruthy();
	        expect(serviceTokenA2.equals(serviceTokenA)).toBeTruthy();
	        expect(serviceTokenA2.uniqueKey()).toEqual(serviceTokenA.uniqueKey());
        });
    });
    
    it("equals master token serial number", function() {
        var masterTokenA, masterTokenB;
        runs(function() {
        	MslTestUtils.getMasterToken(ctx, 1, 1, {
        		result: function(token) { masterTokenA = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        	MslTestUtils.getMasterToken(ctx, 1, 2, {
        		result: function(token) { masterTokenB = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        });
        waitsFor(function() { return masterTokenA && masterTokenB; }, "master tokens", 100);
        
        var serviceTokenA, serviceTokenB;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, masterTokenA, null, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenA = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            ServiceToken.create(ctx, NAME, DATA, masterTokenB, null, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenB = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceTokenA && serviceTokenB; }, "service tokens A and B", 100);

        var serviceTokenA2;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceTokenA, {
        		result: function(mo) {
		            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
		                result: function(token) { serviceTokenA2 = token; },
		                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
		            });
        		},
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return serviceTokenA2; }, "service token A2", 100);

        runs(function() {
	        expect(serviceTokenA.equals(serviceTokenA)).toBeTruthy();
	        expect(serviceTokenA.uniqueKey()).toEqual(serviceTokenA.uniqueKey());
	        
	        expect(serviceTokenA.equals(serviceTokenB)).toBeFalsy();
	        expect(serviceTokenB.equals(serviceTokenA)).toBeFalsy();
	        expect(serviceTokenB.uniqueKey()).not.toEqual(serviceTokenA.uniqueKey());
	        
	        expect(serviceTokenA.equals(serviceTokenA2)).toBeTruthy();
	        expect(serviceTokenA2.equals(serviceTokenA)).toBeTruthy();
	        expect(serviceTokenA2.uniqueKey()).toEqual(serviceTokenA.uniqueKey());
        });
    });
    
    it("equals user ID token serial number", function() {
        var userIdTokenA, userIdTokenB;
        runs(function() {
        	MslTestUtils.getUserIdToken(ctx, MASTER_TOKEN, 1, MockEmailPasswordAuthenticationFactory.USER, {
        		result: function(token) { userIdTokenA = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        	MslTestUtils.getUserIdToken(ctx, MASTER_TOKEN, 2, MockEmailPasswordAuthenticationFactory.USER, {
        		result: function(token) { userIdTokenB = token; },
        		error: function(e) { expect(function() { throw e; }).not.toThrow(); },
        	});
        });
        waitsFor(function() { return userIdTokenA && userIdTokenB; }, "user ID tokens", 100);
        
        var serviceTokenA, serviceTokenB;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, userIdTokenA, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenA = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, userIdTokenB, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceTokenB = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceTokenA && serviceTokenB; }, "service tokens A and B", 100);

        var serviceTokenA2;
        runs(function() {
        	MslTestUtils.toMslObject(encoder, serviceTokenA, {
        		result: function(mo) {
		            ServiceToken.parse(ctx, mo, MASTER_TOKEN, USER_ID_TOKEN, CRYPTO_CONTEXT, {
		                result: function(token) { serviceTokenA2 = token; },
		                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
		            });
        		},
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
        	});
        });
        waitsFor(function() { return serviceTokenA2; }, "service token A2", 100);

        runs(function() {
	        expect(serviceTokenA.equals(serviceTokenA)).toBeTruthy();
	        expect(serviceTokenA.uniqueKey()).toEqual(serviceTokenA.uniqueKey());
	        
	        expect(serviceTokenA.equals(serviceTokenB)).toBeFalsy();
	        expect(serviceTokenB.equals(serviceTokenA)).toBeFalsy();
	        expect(serviceTokenB.uniqueKey()).not.toEqual(serviceTokenA.uniqueKey());
	        
	        expect(serviceTokenA.equals(serviceTokenA2)).toBeTruthy();
	        expect(serviceTokenA2.equals(serviceTokenA)).toBeTruthy();
	        expect(serviceTokenA2.uniqueKey()).toEqual(serviceTokenA.uniqueKey());
        });
    });
    
    it("equals object", function() {
        var serviceToken;
        runs(function() {
            ServiceToken.create(ctx, NAME, DATA, MASTER_TOKEN, USER_ID_TOKEN, ENCRYPTED, compressionAlgo, CRYPTO_CONTEXT, {
                result: function(token) { serviceToken = token; },
                error: function(e) { expect(function() { throw e; }).not.toThrow(); }
            });
        });
        waitsFor(function() { return serviceToken; }, "serviceToken", 100);
        runs(function() {
	        expect(serviceToken.equals(null)).toBeFalsy();
	        expect(serviceToken.equals(DATA)).toBeFalsy();
        });
    });
});
