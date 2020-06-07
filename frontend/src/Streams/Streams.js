import React, { Component } from 'react';

class Streams extends Component {
  render() {
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
                    src={`https://player.twitch.tv/?channel=${s}&autoplay=false`}
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