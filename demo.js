var COMPAT_ENVS = [
  ['Firefox', ">= 16.0"],
  ['Google Chrome',
   ">= 24.0 (you may need to get Google Chrome Canary), NO Blob storage support"]
];
var compat = $('#compat');
compat.empty();
compat.append('<ul id="compat-list"></ul>');
COMPAT_ENVS.forEach(function(val, idx, array) {
  $('#compat-list').append('<li>' + val[0] + ': ' + val[1] + '</li>');
});

const DB_NAME = 'mdn-demo-indexeddb-epublications';
const DB_VERSION = 1; // Use a long long for this value (don't use a float)
const DB_STORE_NAME = 'publications';

var db;

// Used to keep track of which view is displayed to avoid uselessly reloading it
var current_view_pub_key;

function openDb() {
  //console.log("openDb ...");
  var req = indexedDB.open(DB_NAME, DB_VERSION)

  req.onsuccess = function (evt) {
    db = evt.target.result;
    //console.log("openDb DONE");
  }

  req.onerror = function (evt) {
    console.error("openDb:", evt.target.errorCode);
  }

  req.onupgradeneeded = function (evt) {
    //console.log("openDb.onupgradeneeded");
    let db = evt.target.result
    let store = db.createObjectStore( 
      DB_STORE_NAME, 
      { 
        keyPath: 'id', 
        autoIncrement: true 
      }
    )

    store.createIndex('biblioID', 'biblioID', { unique: true })
    store.createIndex('title', 'title', { unique: false })
    store.createIndex('year', 'year', { unique: false })
  }
}

/**
 * @param {string} store_name
 * @param {string} mode either "readonly" or "readwrite"
 */
function getObjectStore(store_name, mode) {
  var tx = db.transaction(store_name, mode);
  return tx.objectStore(store_name);
}

function clearObjectStore(store_name) {
  var store = getObjectStore(DB_STORE_NAME, 'readwrite');
  var req = store.clear();
  req.onsuccess = function(evt) {
    displayActionSuccess("Store cleared");
    displayPubList(store);
  };
  req.onerror = function (evt) {
    console.error("clearObjectStore:", evt.target.errorCode);
    displayActionFailure(this.error);
  };
}

function getBlob(key, store, success_callback) {
  var req = store.get(key);
  req.onsuccess = function(evt) {
    var value = evt.target.result;
    if (value)
      success_callback(value.blob);
  };
}

/**
 * @param {IDBObjectStore=} store
 */
function displayPubList(store) {
  //console.log("displayPubList");

  if (typeof store == 'undefined')
    store = getObjectStore(DB_STORE_NAME, 'readonly');

  var pub_msg = $('#pub-msg');
  pub_msg.empty();
  var pub_list = $('#pub-list');
  pub_list.empty();
  // Resetting the iframe so that it doesn't display previous content
  newViewerFrame();

  var req
  req = store.count();
  req.onsuccess = function(evt) {
    pub_msg.append(`<p>There are <strong>${evt.target.result}</strong> record(s) in the object store.</p>`);
  }
  req.onerror = function(evt) {
    console.error("add error", this.error)
    displayActionFailure(this.error)
  }

  req = store.openCursor()
  req.onsuccess = function(evt) {
    var cursor = evt.target.result

    if (cursor) {
      req = store.get(cursor.key);
      req.onsuccess = function (evt) {
        var value = evt.target.result
        render(value)
      }

      // Move on to the next object in store
      cursor.continue()

    } else {
      //console.log("No more entries");
    }
  };
}

let render = value => {
  let pub_msg = $('#pub-msg');
  let pub_list = $('#pub-list');
  let list_item = $(`<li>
     [biblioID: ${value.biblioID}]
     ${value.title}
     ${value.year? `- ${value.year} ` : ""}
     </li>`
  )

  if (value.hasOwnProperty('blob') && typeof value.blob != 'undefined') {
    let button = document.createElement('button')
    button.textContent = 'show'
    button.addEventListener('click', function(evt) { 
      setInViewer(value.id)
    })
    list_item.append(' / ')
    list_item.append(button)
  } else {
    list_item.append(" / No attached file")
  }
  pub_list.append(list_item)
}

function newViewerFrame() {
  var viewer = $('#pub-viewer');
  viewer.empty();
  var iframe = $('<iframe />');
  viewer.append(iframe);
  return iframe;
}

function setInViewer(id) {
  //key = Number(value.id)
  //if (key == current_view_pub_key)
  if (id == current_view_pub_key)
    return;

  //current_view_pub_key = key;
  current_view_pub_key = id;

  var store = getObjectStore(DB_STORE_NAME, 'readonly');
  getBlob(id, store, function(blob) {
    var iframe = newViewerFrame();

    // It is not possible to set a direct link to the
    // blob to provide a mean to directly download it.
    if (blob.type == 'text/html') {
      var reader = new FileReader();
      reader.onload = (function(evt) {
        var html = evt.target.result;
        iframe.load(function() {
          $(this).contents().find('html').html(html);
        });
      });
      reader.readAsText(blob);
    } else if (blob.type.indexOf('image/') == 0) {
      iframe.load(function() {
        //var img_id = 'image-' + key;
        var img_id = 'image-' + id;
        var img = $('<img id="' + img_id + '"/>');
        $(this).contents().find('body').html(img);
        var obj_url = window.URL.createObjectURL(blob);
        $(this).contents().find('#' + img_id).attr('src', obj_url);
        window.URL.revokeObjectURL(obj_url);
      });
    } else if (blob.type == 'application/pdf') {
      $('*').css('cursor', 'wait');
      var obj_url = window.URL.createObjectURL(blob);
      iframe.load(function() {
        $('*').css('cursor', 'auto');
      });
      iframe.attr('src', obj_url);
      window.URL.revokeObjectURL(obj_url);
    } else {
      iframe.load(function() {
        $(this).contents().find('body').html("No view available");
      });
    }

  });
}

/**
 * @param {string} biblioID
 * @param {string} title
 * @param {number} year
 * @param {string} url the URL of the image to download and store in the local
 *   IndexedDB database. The resource behind this URL is subjected to the
 *   "Same origin policy", thus for this method to work, the URL must come from
 *   the same origin as the web site/app this code is deployed on.
 */
function addPublicationFromUrl(biblioID, title, year, url) {
  //console.log("addPublicationFromUrl:", arguments);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  // Setting the wanted responseType to "blob"
  // http://www.w3.org/TR/XMLHttpRequest2/#the-response-attribute
  xhr.responseType = 'blob';
  xhr.onload = function (evt) {
    if (xhr.status == 200) {
      //console.log("Blob retrieved");
      var blob = xhr.response;
      //console.log("Blob:", blob);
      addPublication(biblioID, title, year, blob);
    } else {
      console.error("addPublicationFromUrl error:",
      xhr.responseText, xhr.status);
    }
  };
  xhr.send();

  // We can't use jQuery here because as of jQuery 1.8.3 the new "blob"
  // responseType is not handled.
  // http://bugs.jquery.com/ticket/11461
  // http://bugs.jquery.com/ticket/7248
  // $.ajax({
  //   url: url,
  //   type: 'GET',
  //   xhrFields: { responseType: 'blob' },
  //   success: function(data, textStatus, jqXHR) {
  //     console.log("Blob retrieved");
  //     console.log("Blob:", data);
  //     // addPublication(biblioID, title, year, data);
  //   },
  //   error: function(jqXHR, textStatus, errorThrown) {
  //     console.error(errorThrown);
  //     displayActionFailure("Error during blob retrieval");
  //   }
  // });
}

/**
 * @param {string} biblioID
 * @param {string} title
 * @param {number} year
 * @param {Blob=} blob
 */
function addPublication(biblioID, title, year, blob) {
  //console.log("addPublication arguments:", arguments);
  var obj = { biblioID: biblioID, title: title, year: year };
  if (typeof blob != 'undefined')
    obj.blob = blob;

  var store = getObjectStore(DB_STORE_NAME, 'readwrite');
  var req;
  try {
    req = store.add(obj);
  } catch (e) {
    if (e.name == 'DataCloneError')
      displayActionFailure("This engine doesn't know how to clone a Blob, " +
                           "use Firefox");
    throw e;
  }
  req.onsuccess = function (evt) {
    //console.log("Insertion in DB successful");
    displayActionSuccess();
    displayPubList(store);
  };
  req.onerror = function() {
    console.error("addPublication error", this.error);
    displayActionFailure(this.error);
  };
}

/**
 * @param {string} biblioID
 */
function deletePublicationFromBib(biblioID) {
  //console.log("deletePublication:", arguments);
  var store = getObjectStore(DB_STORE_NAME, 'readwrite');
  var req = store.index('biblioID');
  req.get(biblioID).onsuccess = function(evt) {
    if (typeof evt.target.result == 'undefined') {
      displayActionFailure("No matching record found");
      return;
    }
    deletePublication(evt.target.result.id, store);
  };
  req.onerror = function (evt) {
    console.error("deletePublicationFromBib:", evt.target.errorCode);
  };
}

/**
 * @param {number} key
 * @param {IDBObjectStore=} store
 */
function deletePublication(key, store) {
  //console.log("deletePublication:", arguments);

  if (typeof store == 'undefined')
    store = getObjectStore(DB_STORE_NAME, 'readwrite');

  // As per spec http://www.w3.org/TR/IndexedDB/#object-store-deletion-operation
  // the result of the Object Store Deletion Operation algorithm is
  // undefined, so it's not possible to know if some records were actually
  // deleted by looking at the request result.
  var req = store.get(key);
  req.onsuccess = function(evt) {
    var record = evt.target.result;
    //console.log("record:", record);
    if (typeof record == 'undefined') {
      displayActionFailure("No matching record found");
      return;
    }
    // Warning: The exact same key used for creation needs to be passed for
    // the deletion. If the key was a Number for creation, then it needs to
    // be a Number for deletion.
    req = store.delete(key);
    req.onsuccess = function(evt) {
      //console.log("evt:", evt);
      //console.log("evt.target:", evt.target);
      //console.log("evt.target.result:", evt.target.result);
      //console.log("delete successful");
      displayActionSuccess("Deletion successful");
      displayPubList(store);
    };
    req.onerror = function (evt) {
      console.error("deletePublication:", evt.target.errorCode);
    };
  };
  req.onerror = function (evt) {
    console.error("deletePublication:", evt.target.errorCode);
  };
}

function displayActionSuccess(msg) {
  msg = typeof msg != 'undefined' ? "Success: " + msg : "Success";
  $('#msg').html('<span class="action-success">' + msg + '</span>');
}
function displayActionFailure(msg) {
  msg = typeof msg != 'undefined' ? "Failure: " + msg : "Failure";
  $('#msg').html('<span class="action-failure">' + msg + '</span>');
}
function resetActionStatus() {
  //console.log("resetActionStatus ...");
  $('#msg').empty();
  //console.log("resetActionStatus DONE");
}

function addEventListeners() {
  //console.log("addEventListeners");

  $('#register-form-reset').click(function(evt) {
    resetActionStatus();
  });

  $('#add-button').click(function(evt) {
    //console.log("add ...");
    var title = $('#pub-title').val();
    var biblioID = $('#pub-biblioID').val();
    if (!title || !biblioID) {
      displayActionFailure("Required field(s) missing");
      return;
    }
    var year = $('#pub-year').val();
    if (year != '') {
      // Better use Number.isInteger if the engine has EcmaScript 6
      if (isNaN(year))  {
        displayActionFailure("Invalid year");
        return;
      }
      year = Number(year);
    } else {
      year = null;
    }

    var file_input = $('#pub-file');
    var selected_file = file_input.get(0).files[0];
    //console.log("selected_file:", selected_file);
    // Keeping a reference on how to reset the file input in the UI once we
    // have its value, but instead of doing that we rather use a "reset" type
    // input in the HTML form.
    //file_input.val(null);
    var file_url = $('#pub-file-url').val();
    if (selected_file) {
      addPublication(biblioID, title, year, selected_file);
    } else if (file_url) {
      addPublicationFromUrl(biblioID, title, year, file_url);
    } else {
      addPublication(biblioID, title, year);
    }

  });

  $('#delete-button').click(function(evt) {
    //console.log("delete ...");
    var biblioID = $('#pub-biblioID-to-delete').val();
    var key = $('#key-to-delete').val();

    if (biblioID != '') {
      deletePublicationFromBib(biblioID);
    } else if (key != '') {
      // Better use Number.isInteger if the engine has EcmaScript 6
      if (key == '' || isNaN(key))  {
        displayActionFailure("Invalid key");
        return;
      }
      key = Number(key);
      deletePublication(key);
    }
  });

  $('#clear-store-button').click(function(evt) {
    clearObjectStore();
  });

  var search_button = $('#search-list-button');
  search_button.click(function(evt) {
    displayPubList();
  });

}

openDb();
addEventListeners();


