import React, { Component } from 'react';

class Streams extends Component {
  render() {
    const parent = 'statuspog.herokuapp.com';
    
    return (
      <div className='streams-wrapper'>
        {
          this.props.active === null
          && <div className='loading'>
              <div className="lds-ripple"><div></div><div></div></div>
             </div>
        }
        {
          this.props.active
          && <div className='streams'>
            {
              this.props.active.map((s) => (
                <div key={s}>
                  <iframe
                    title={`${s}-iframe`}
                    src={`https://player.twitch.tv/?channel=${s}&parent=${parent}&autoplay=false`}
                  >
                  </iframe>
                </div>
              ))
            }
          </div>
        }
      </div>
    )
  }
}

export default Streams;