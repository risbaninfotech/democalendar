import mongoose, {Schema, model} from 'mongoose';
import Status from './Status.js';

const eventSchema = new Schema({
    start_date: { 
        type: Date,
        min: () => Date.now(),
        required: true 
    },
    start_time: { 
        type: Date, 
        min: () => Date.now(),
        required: true 
    },
    end_date: { 
        type: Date,
        min: () => Date.now(),
        required: true
    },
    end_time: { 
        type: Date, 
        min: () => Date.now(),
        required: true 
    },
    event_name: { 
        type: String, 
        required: true 
    },
    artist_name: { 
        type: String, 
        required: true 
    },
    artist_type: { 
        type: String, 
        required: true 
    },
    city: { 
        type: String, 
    },
    venue: { 
        type: String, 
    },
    artist_amount: { 
        type: Number,
        required: true 
    },
    promoter_name: { 
        type: String, 
    },
    promoter_phone: { 
        type: String, 
    },
    promoter_email: { 
        type: String, 
    },
    source: { 
        type: String,
        default: 'mongo'
    },
    status: { 
        type: Schema.Types.ObjectId,
        ref: 'Status',
        required: true 
    },
},
{
    timestamps: true
});

const Event = model('Event', eventSchema);
export default Event;