import React from 'react';
import ReactQuill, { Quill } from 'react-quill';
import ReconnectingWebSocket from 'reconnectingwebsocket';


import classNames from 'classnames/bind';
// sharedb-cursor , image upload

import 'react-quill/dist/quill.snow.css';
import styles from './Editor.scss';
import axios from 'axios';
import QuillCursors from 'quill-cursors';

import { ImageUpload } from 'quill-image-upload';
import { stat } from 'fs';
const ShareDB = require('sharedb/lib/client');
const cursors = require('./cursors');

ShareDB.types.register(require('rich-text').type);
Quill.register('modules/imageUpload', ImageUpload);
Quill.register('modules/cursors', QuillCursors);
const shareDBSocket = new ReconnectingWebSocket(((window.location.protocol === 'https:') ? 'wss' : 'ws') + '://' + window.location.hostname + ':4000/sharedb');
const shareDBConnection = new ShareDB.Connection(shareDBSocket);




//--------------------------------------------------------------------------------------------------------------------------------------
const cx = classNames.bind(styles);

class Editor extends React.Component {
  constructor(props) {
    super(props);
    this.reactQuillRef = null;
  }



  componentDidMount() {
    const doc = shareDBConnection.get('documents', 'foobar');
    const quillRef = this.reactQuillRef.getEditor();
    const cursorsModule = quillRef.getModule('cursors');


    doc.subscribe(function (err) {
      if (err) throw err;

      if (!doc.type)
        doc.create([{
          insert: '\n'
        }], 'rich-text');

      console.log(doc.data);

      // update editor contents
      quillRef.setContents(doc.data);

      // local -> server
      quillRef.on('text-change', function (delta, oldDelta, source) {
        if (source == 'user') {

          // Check if it's a formatting-only delta
          var formattingDelta = delta.reduce(function (check, op) {
            return (op.insert || op.delete) ? false : check;
          }, true);

          // If it's not a formatting-only delta, collapse local selection
          if (
            !formattingDelta &&
            cursors.localConnection.range &&
            cursors.localConnection.range.length
          ) {
            cursors.localConnection.range.index += cursors.localConnection.range.length;
            cursors.localConnection.range.length = 0;
            cursors.update();
          }

          doc.submitOp(delta, {
            source: quillRef
          }, function (err) {
            if (err)
              console.error('Submit OP returned an error:', err);
          });
        }
      });

      // cursorsModule.registerTextChangeListener();

      // server -> local
      doc.on('op', function (op, source) {
        if (source !== quillRef) {
          quillRef.updateContents(op);
        }
      });

      //
      function sendCursorData(range) {
        console.log('sendCursorData : ' + range);
        cursors.localConnection.range = range;
        cursors.update();
      }

      //
      function debounce(func, wait, immediate) {
        var timeout;
        return function () {
          var context = this,
            args = arguments;
          var later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
          };
          var callNow = immediate && !timeout;
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
          if (callNow) func.apply(context, args);
        };
      };

      // getSelection : focus by cursor
      var debouncedSendCursorData = debounce(function () {
        var range = quillRef.getSelection();

        if (range) {
          console.log('[cursors] Stopped typing, sending a cursor update/refresh.');
          sendCursorData(range);
        }
      }, 1500);

      doc.on('nothing pending', debouncedSendCursorData);

      function updateCursors(source) {
        var activeConnections = {},
          updateAll = Object.keys(cursorsModule.cursors).length == 0;

        cursors.connections.forEach(function (connection) {
          if (connection.id !== cursors.localConnection.id) {

            // Update cursor that sent the update, source (or update all if we're initting)
            if ((connection.id === source.id || updateAll) && connection.range) {
              cursorsModule.createCursor(connection.id, connection.id, connection.color);

            }

            // Add to active connections hashtable
            activeConnections[connection.id] = connection;
          }
        });

        // Clear 'disconnected' cursors
        Object.keys(cursorsModule.cursors).forEach(function (cursorId) {
          if (!activeConnections[cursorId]) {
            cursorsModule.removeCursor(cursorId);
          }
        });
      }

      quillRef.on('selection-change', function (range, oldRange, source) {
        console.log('selection-change : ' + range);
        sendCursorData(range);
      });

      document.addEventListener('cursors-update', function (e) {
        // Handle Removed Connections
        e.detail.removedConnections.forEach(function (connection) {
          if (cursorsModule.cursors[connection.id])
            cursorsModule.removeCursor(connection.id);
        });

        updateCursors(e.detail.source);
      });

      updateCursors(cursors.localConnection);
    });

    window.cursors = cursors;

  }

  render() {

    return (

      <div className={cx('editor-main')}>

        <input type='button' value='연결' onClick={(e) => {
          cursors.localConnection.name = "원진";
          cursors.update();
          this.reactQuillRef.getEditor().enable();
        }} />
        <ReactQuill
          ref={(el) => { this.reactQuillRef = el }}
          theme='snow'
          readOnly
          modules={Editor.modules}
          formats={Editor.formats}
          bounds='.editor-main'
        />
      
      </div>
    );
  }
}



Editor.modules = {
  cursors: true,
  toolbar: {
    container: [
      [{ 'header': '1' }, { 'header': '2' }, { 'font': [] }],
      [{ size: [] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' },
      { 'indent': '-1' }, { 'indent': '+1' }],
      ['link', 'image', 'video'],
      ['clean'],
    ],
    
  },
  history: {
    userOnly: true
  },
  clipboard: { matchVisual: false },
  imageUpload: {
    url: 'http://localhost:4000/image', // server url. If the url is empty then the base64 returns
    method: 'POST', // change query method, default 'POST'
    name: 'image', // custom form name
    withCredentials: false, // withCredentials
    headers: {'Content-Type' : 'multipart/form-data'}, // add custom headers, example { token: 'your-token'}
    //csrf: { token: 'token', hash: '' }, // add custom CSRF
    customUploader: () => {


    }, // add custom uploader
    // personalize successful callback and call next function to insert new url to the editor
    callbackOK: (serverResponse, next) => {
      console.log('callbackOk : '+ serverResponse.responseText)
      next(serverResponse);
    },
    // personalize failed callback
    callbackKO: serverError => {
      console.log(serverError);
      alert(serverError);
    },
    // optional
    // add callback when a image have been chosen
    checkBeforeSend: (file, next) => {
      console.log(file.name);
      next(file); // go back to component and send to the server
    }
  }
};

// imageSelectHandler = ()=>{
//   const input = (<input type="file"/>);
//   input.click();

//   input.onChange=()=>{
//       const fileData = new FormData();
//       const file = this[0].files[0];

//       fileData.append('image', file);

//       axios.post(url, data, config)
//       .then((res)=>{

//       })
//       .catch((err)=>{
//         console.log('fileupload err : '+ err);
//       })
//   }
// }

Editor.formats = [
  'header', 'font', 'size',
  'bold', 'italic', 'underline', 'strike', 'blockquote',
  'list', 'bullet', 'indent',
  'link', 'image', 'video'];



export default Editor;