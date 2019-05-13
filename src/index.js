import React from 'react';
import ReactDOM from 'react-dom';
import Editor from './Editor';
import * as serviceWorker from './serviceWorker';

ReactDOM.render(<Editor />, document.getElementById('root'));
serviceWorker.unregister();
